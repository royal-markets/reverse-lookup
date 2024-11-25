package spotify

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"song-recognition/db"
	"song-recognition/shazam"
	"song-recognition/utils"
	"song-recognition/wav"
	"song-recognition/hash"
	"strings"
	"sync"
	"time"

	"github.com/fatih/color"
	"github.com/mdobak/go-xerrors"
)

const DELETE_SONG_FILE = false

var yellow = color.New(color.FgYellow)

func DlSingleTrack(url, savePath string) (int, error) {
	trackInfo, err := TrackInfo(url)
	if err != nil {
		return 0, err
	}

	fmt.Println("Getting track info...")
	time.Sleep(500 * time.Millisecond)
	track := []Track{*trackInfo}

	fmt.Println("Now, downloading track...")
	totalTracksDownloaded, err := dlTrack(track, savePath)
	if err != nil {
		return 0, err
	}

	return totalTracksDownloaded, nil
}

func DlPlaylist(url, savePath string) (int, error) {
	tracks, err := PlaylistInfo(url)
	if err != nil {
		return 0, err
	}

	time.Sleep(1 * time.Second)
	fmt.Println("Now, downloading playlist...")
	totalTracksDownloaded, err := dlTrack(tracks, savePath)
	if err != nil {
		return 0, err
	}

	return totalTracksDownloaded, nil
}

func DlAlbum(url, savePath string) (int, error) {
	tracks, err := AlbumInfo(url)
	if err != nil {
		return 0, err
	}

	time.Sleep(1 * time.Second)
	fmt.Println("Now, downloading album...")
	totalTracksDownloaded, err := dlTrack(tracks, savePath)
	if err != nil {
		return 0, err
	}

	return totalTracksDownloaded, nil
}

func dlTrack(tracks []Track, path string) (int, error) {
	var wg sync.WaitGroup
	var downloadedTracks []string
	var totalTracks int
	logger := utils.GetLogger()
	results := make(chan int, len(tracks))
	numCPUs := runtime.NumCPU()
	semaphore := make(chan struct{}, numCPUs)

	ctx := context.Background()

	db, err := db.NewDBClient()
	if err != nil {
		return 0, err
	}
	defer db.Close()

	for _, t := range tracks {
		wg.Add(1)
		go func(track Track) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() {
				<-semaphore
			}()

			trackCopy := &Track{
				Album:    track.Album,
				Artist:   track.Artist,
				Artists:  track.Artists,
				Duration: track.Duration,
				Title:    track.Title,
			}

			// check if song exists
			keyExists, err := SongKeyExists(utils.GenerateSongKey(trackCopy.Title, trackCopy.Artist))
			if err != nil {
				err := xerrors.New(err)
				logger.ErrorContext(ctx, "error checking song existence", slog.Any("error", err))
			}
			if keyExists {
				logMessage := fmt.Sprintf("'%s' by '%s' already exits.", trackCopy.Title, trackCopy.Artist)
				logger.Info(logMessage)
			}

			ytID, err := getYTID(trackCopy)
			if ytID == "" || err != nil {
				logMessage := fmt.Sprintf("'%s' by '%s' could not be downloaded", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", xerrors.New(err)))
				return
			}

			trackCopy.Title, trackCopy.Artist = correctFilename(trackCopy.Title, trackCopy.Artist)
			fileName := fmt.Sprintf("%s - %s", trackCopy.Title, trackCopy.Artist)
			filePath := filepath.Join(path, fileName+".wav")

			err = downloadYTaudio(ytID, path, filePath)
			if err != nil {
				logMessage := fmt.Sprintf("'%s' by '%s' could not be downloaded", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			songID, err := db.RegisterSong(trackCopy.Title, trackCopy.Artist, ytID)
			if err != nil {
				logMessage := fmt.Sprintf("Failed to register song ('%s' by '%s')", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			wavInfo, err := wav.ReadWavInfo(filePath)
			if err != nil {
				logMessage := fmt.Sprintf("Failed to read WAV info ('%s' by '%s')", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			samples, err := wav.WavBytesToSamples(wavInfo.Data)
			if err != nil {
				logMessage := fmt.Sprintf("Failed to convert samples ('%s' by '%s')", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			spectro, err := shazam.Spectrogram(samples, wavInfo.SampleRate)
			if err != nil {
				logMessage := fmt.Sprintf("Failed to create spectrogram ('%s' by '%s')", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			peaks := shazam.ExtractPeaks(spectro, wavInfo.Duration)
			fingerprints := shazam.Fingerprint(peaks, songID)

			err = db.StoreFingerprints(fingerprints)
			if err != nil {
				db.DeleteSongByID(songID)
				logMessage := fmt.Sprintf("Failed to store fingerprints ('%s' by '%s')", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			// After successful download, calculate hash
			hash, err := hash.CalculateBlake3(filePath)
			if err != nil {
				logMessage := fmt.Sprintf("Failed to calculate hash for '%s' by '%s'", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			// Store hash in database
			err = db.StoreHash(uint32(songID), hash)
			if err != nil {
				logMessage := fmt.Sprintf("Failed to store hash for '%s' by '%s'", trackCopy.Title, trackCopy.Artist)
				logger.ErrorContext(ctx, logMessage, slog.Any("error", err))
				return
			}

			fmt.Printf("Hash calculated and stored for '%s' by '%s'\n", track.Title, track.Artist)
			fmt.Printf("'%s' by '%s' was downloaded\n", track.Title, track.Artist)
			downloadedTracks = append(downloadedTracks, fmt.Sprintf("%s, %s", track.Title, track.Artist))
			results <- 1
		}(t)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	for range results {
		totalTracks++
	}

	fmt.Println("Total tracks downloaded:", totalTracks)
	return totalTracks, nil

}

func downloadYTaudio(id, path, filePath string) error {
	dir, err := os.Stat(path)
	if err != nil {
		panic(err)
	}

	if !dir.IsDir() {
		return errors.New("the path is not valid (not a dir)")
	}

	// Use yt-dlp to download directly as WAV
	cmd := exec.Command("yt-dlp",
		"-x",                        // Extract audio
		"--audio-format", "wav",     // Convert to WAV
		"--audio-quality", "0",      // Best quality
		"--no-playlist",            // Don't download playlists
		"--no-warnings",            // Suppress warnings
		"--force-overwrites",       // Overwrite existing files
		"-o", strings.TrimSuffix(filePath, filepath.Ext(filePath)) + ".%(ext)s", // Output file pattern
		fmt.Sprintf("https://www.youtube.com/watch?v=%s", id), // YouTube URL
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("yt-dlp failed: %v, output: %s", err, string(output))
	}

	// Verify the WAV file exists
	wavPath := strings.TrimSuffix(filePath, filepath.Ext(filePath)) + ".wav"
	if _, err := os.Stat(wavPath); err != nil {
		return fmt.Errorf("WAV file not found after download: %v", err)
	}

	return nil
}

func addTags(file string, track Track) error {
	// Create a temporary file name by appending "2" before the extension
	tempFile := file
	index := strings.Index(file, ".wav")
	if index != -1 {
		baseName := tempFile[:index]       // Filename without extension ('/path/to/title - artist')
		tempFile = baseName + "2" + ".wav" // Temporary filename ('/path/to/title - artist2.wav')
	}

	// Execute FFmpeg command to add metadata tags
	cmd := exec.Command(
		"ffmpeg",
		"-i", file, // Input file path
		"-c", "copy",
		"-metadata", fmt.Sprintf("album_artist=%s", track.Artist),
		"-metadata", fmt.Sprintf("title=%s", track.Title),
		"-metadata", fmt.Sprintf("artist=%s", track.Artist),
		"-metadata", fmt.Sprintf("album=%s", track.Album),
		tempFile, // Output file path (temporary)
	)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to add tags: %v, output: %s", err, string(out))
	}

	// Rename the temporary file to the original filename
	if err := os.Rename(tempFile, file); err != nil {
		return fmt.Errorf("failed to rename file: %v", err)
	}

	return nil
}

func ProcessAndSaveSong(songFilePath, songTitle, songArtist, ytID string) error {
	dbclient, err := db.NewDBClient()
	if err != nil {
		return err
	}
	defer dbclient.Close()

	wavInfo, err := wav.ReadWavInfo(songFilePath)
	if err != nil {
		return err
	}

	samples, err := wav.WavBytesToSamples(wavInfo.Data)
	if err != nil {
		return fmt.Errorf("error converting wav bytes to float64: %v", err)
	}

	spectro, err := shazam.Spectrogram(samples, wavInfo.SampleRate)
	if err != nil {
		return fmt.Errorf("error creating spectrogram: %v", err)
	}

	// Get or create song ID
	var songID uint32
	key := utils.GenerateSongKey(songTitle, songArtist)
	song, exists, err := dbclient.GetSongByKey(key)
	if err != nil {
		return err
	}

	if exists {
		songID = song.ID
		log.Printf("Using existing song ID: %d", songID)
	} else {
		songID, err = dbclient.RegisterSong(songTitle, songArtist, ytID)
		if err != nil {
			return err
		}
		log.Printf("Registered new song with ID: %d", songID)
	}

	// Always process and store fingerprints
	peaks := shazam.ExtractPeaks(spectro, wavInfo.Duration)
	fingerprints := shazam.Fingerprint(peaks, songID)

	err = dbclient.StoreFingerprints(fingerprints)
	if err != nil {
		if !exists {
			dbclient.DeleteSongByID(songID)
		}
		return fmt.Errorf("error storing fingerprints: %v", err)
	}

	log.Printf("Successfully processed song %s by %s with ID %d and %d fingerprints", 
		songTitle, songArtist, songID, len(fingerprints))

	return nil
}

func getYTID(trackCopy *Track) (string, error) {
	ytID, err := GetYoutubeId(*trackCopy)
	if ytID == "" || err != nil {
		return "", err
	}

	// Check if YouTube ID exists
	ytidExists, err := YtIDExists(ytID)
	if err != nil {
		return "", fmt.Errorf("error checking YT ID existence: %v", err)
	}

	// If the song exists, we can use the existing YouTube ID
	if ytidExists {
		key := utils.GenerateSongKey(trackCopy.Title, trackCopy.Artist)
		song, exists, err := db.NewDBClient().GetSongByKey(key)
		if err == nil && exists && song.YouTubeID == ytID {
			// If this is our song, use the existing YouTube ID
			return ytID, nil
		}

		// Only try again if it's not our song
		logMessage := fmt.Sprintf("YouTube ID (%s) exists but for a different song. Trying again...\n", ytID)
		fmt.Println("WARN: ", logMessage)
		slog.Warn(logMessage)

		ytID, err = GetYoutubeId(*trackCopy)
		if ytID == "" || err != nil {
			return "", err
		}

		ytidExists, err = YtIDExists(ytID)
		if err != nil {
			return "", fmt.Errorf("error checking YT ID existence: %v", err)
		}

		if ytidExists {
			return "", fmt.Errorf("youTube ID (%s) exists", ytID)
		}
	}

	return ytID, nil
}

func DlSingleTrackWithPath(url string, savePath string) (int, string, error) {
	trackInfo, err := TrackInfo(url)
	if err != nil {
		return 0, "", err
	}

	fmt.Println("Getting track info...")
	time.Sleep(500 * time.Millisecond)
	track := []Track{*trackInfo}

	fmt.Println("Now, downloading track...")
	totalTracksDownloaded, err := dlTrack(track, savePath)
	if err != nil {
		return 0, "", err
	}

	fileName := fmt.Sprintf("%s - %s", trackInfo.Title, trackInfo.Artist)
	wavPath := filepath.Join(savePath, fileName+".wav")

	// Process and save the song
	err = ProcessAndSaveSong(wavPath, trackInfo.Title, trackInfo.Artist, "")
	if err != nil {
		log.Printf("Warning: Failed to process and save song: %v", err)
	}

	if _, err := os.Stat(wavPath); err != nil {
		return 0, "", fmt.Errorf("WAV file not found after conversion: %v", err)
	}

	return totalTracksDownloaded, wavPath, nil
}

