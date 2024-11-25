package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	_ "github.com/mattn/go-sqlite3"
	"song-recognition/models"
	"song-recognition/utils"
)

type SQLiteClient struct {
	db *sql.DB
}

func NewSQLiteClient(dbPath string) (*SQLiteClient, error) {
	// Create the database directory if it doesn't exist
	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %v", err)
	}

	// Check if database exists
	dbExists := false
	if _, err := os.Stat(dbPath); err == nil {
		dbExists = true
	}

	// Open the database
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&cache=shared")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %v", err)
	}

	client := &SQLiteClient{db: db}
	
	// Only initialize schema if database is new
	if !dbExists {
		if err := client.initializeSchema(); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to initialize schema: %v", err)
		}
		log.Println("SQLite database initialized successfully")
	}

	// Verify schema exists
	if err := client.verifySchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to verify schema: %v", err)
	}

	return client, nil
}

func (db *SQLiteClient) initializeSchema() error {
	// Create tables if they don't exist (remove DROP TABLE statements)
	_, err := db.db.Exec(`
		CREATE TABLE IF NOT EXISTS songs (
			id INTEGER PRIMARY KEY,
			title TEXT NOT NULL,
			artist TEXT NOT NULL,
			youtube_id TEXT,
			key TEXT UNIQUE,
				blake3_hash TEXT
		);

		CREATE TABLE IF NOT EXISTS fingerprints (
			address INTEGER NOT NULL,
			song_id INTEGER NOT NULL,
			anchor_time_ms INTEGER NOT NULL,
				FOREIGN KEY(song_id) REFERENCES songs(id)
		);

		CREATE INDEX IF NOT EXISTS idx_youtube_id ON songs(youtube_id);
		CREATE INDEX IF NOT EXISTS idx_song_key ON songs(key);
	`)

	if err != nil {
		return fmt.Errorf("failed to initialize schema: %v", err)
	}

	return nil
}

func (db *SQLiteClient) verifySchema() error {
	// Query to get table info
	rows, err := db.db.Query(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name IN ('songs', 'fingerprints')
	`)
	if err != nil {
		return fmt.Errorf("failed to verify schema: %v", err)
	}
	defer rows.Close()

	log.Println("Current database schema:")
	for rows.Next() {
		var sql string
		if err := rows.Scan(&sql); err != nil {
			return fmt.Errorf("failed to scan schema: %v", err)
		}
		log.Println(sql)
	}
	return nil
}

func (db *SQLiteClient) StoreHash(songID uint32, hash string) error {
	_, err := db.db.Exec("UPDATE songs SET blake3_hash = ? WHERE id = ?", hash, songID)
	return err
}

func (db *SQLiteClient) GetHash(songID uint32) (string, error) {
	var hash string
	err := db.db.QueryRow("SELECT blake3_hash FROM songs WHERE id = ?", songID).Scan(&hash)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("no hash found for song ID %d", songID)
	}
	return hash, err
}

// Implement all required interface methods
func (db *SQLiteClient) Close() error {
	return db.db.Close()
}

func (db *SQLiteClient) StoreFingerprints(fingerprints map[uint32]models.Couple) error {
	// Implementation
	return nil
}

func (db *SQLiteClient) GetCouples(addresses []uint32) (map[uint32][]models.Couple, error) {
	// Implementation
	return nil, nil
}

func (db *SQLiteClient) TotalSongs() (int, error) {
	// Implementation
	return 0, nil
}

func (db *SQLiteClient) DeleteCollection(collectionName string) error {
	// Implementation
	return nil
}

// Add this method to implement the full DBClient interface
func (db *SQLiteClient) DeleteSongByID(songID uint32) error {
	_, err := db.db.Exec("DELETE FROM songs WHERE id = ?", songID)
	if err != nil {
		return fmt.Errorf("failed to delete song: %v", err)
	}
	return nil
}

// Also need to implement these missing methods
func (db *SQLiteClient) GetSong(filterKey string, value interface{}) (Song, bool, error) {
	var song Song
	var query string
	
	switch filterKey {
	case "id":
		query = "SELECT id, title, artist, youtube_id FROM songs WHERE id = ?"
	case "ytID":
		query = "SELECT id, title, artist, youtube_id FROM songs WHERE youtube_id = ?"
	case "key":
		query = "SELECT id, title, artist, youtube_id FROM songs WHERE key = ?"
	default:
		return Song{}, false, fmt.Errorf("invalid filter key: %s", filterKey)
	}

	err := db.db.QueryRow(query, value).Scan(&song.ID, &song.Title, &song.Artist, &song.YouTubeID)
	if err == sql.ErrNoRows {
		return Song{}, false, nil
	}
	if err != nil {
		return Song{}, false, err
	}

	return song, true, nil
}

func (db *SQLiteClient) GetSongByID(songID uint32) (Song, bool, error) {
	return db.GetSong("id", songID)
}

func (db *SQLiteClient) GetSongByYTID(ytID string) (Song, bool, error) {
	return db.GetSong("ytID", ytID)
}

func (db *SQLiteClient) GetSongByKey(key string) (Song, bool, error) {
	return db.GetSong("key", key)
}

func (db *SQLiteClient) RegisterSong(songTitle, songArtist, ytID string) (uint32, error) {
	key := utils.GenerateSongKey(songTitle, songArtist)
	result, err := db.db.Exec("INSERT INTO songs (title, artist, youtube_id, key) VALUES (?, ?, ?, ?)",
		songTitle, songArtist, ytID, key)
	if err != nil {
		return 0, fmt.Errorf("failed to register song: %v", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert ID: %v", err)
	}

	log.Printf("Registered song: %s by %s with ID %d", songTitle, songArtist, id)
	return uint32(id), nil
}

// ... rest of SQLite implementation methods ...

