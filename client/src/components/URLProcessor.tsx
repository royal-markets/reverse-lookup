'use client';
import React, { useState } from "react";
import { Socket } from "socket.io-client";
import { URLProcessingState, ProcessingResult, spotifyUrlSchema } from "../lib/types";
import { toast } from "react-toastify";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { SpotifyUrlInput } from "../lib/types";

interface Props {
  socket: Socket;
}

interface Match {
  SongTitle: string;
  SongArtist: string;
  Score: number;
  blake3_hash?: string;
  YouTubeID?: string;
  Timestamp: number;
  SongID: number;
}

const URLProcessor: React.FC<Props> = ({ socket }) => {
  const [state, setState] = useState<URLProcessingState>('idle');
  console.log('state in URLProcessor:', state)
  const [result, setResult] = useState<ProcessingResult>({});
  console.log('result in URLProcessor:', result)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<SpotifyUrlInput>({
    resolver: zodResolver(spotifyUrlSchema)
  });

  const resetFormOnly = () => {
    setState('idle');
  };

  const resetAll = () => {
    setState('idle');
    setResult({});
  };

  React.useEffect(() => {
    if (!socket) {
      console.log('Socket not initialized');
      return;
    }

    socket.on("downloadStatus", (msg) => {
      console.log("Received downloadStatus:", msg, typeof msg);
      
      if (typeof msg === 'string') {
        if (msg.includes('Starting download...')) {
          console.log('Showing download start message');
          toast.info(msg);
          return;
        }
        if (msg.toLowerCase().includes('failed to convert to wav')) {
          console.log('Ignoring WAV conversion error');
          return;
        }
      }

      try {
        const status = typeof msg === 'string' ? JSON.parse(msg) : msg;
        console.log("Parsed status:", status);

        if (status.type === 'success') {
          console.log('Success status received:', status.message);
          
          if (status.message === 'Analysis complete') {
            console.log('Analysis complete, enabling input');
            setState('complete');
            toast.success(status.message);
            setTimeout(resetFormOnly, 1000);
          } else {
            console.log('Download succeeded, moving to fingerprinting');
            setState('fingerprinting');
            toast.success(status.message);
            
            if (status.filename) {
              console.log("Emitting find_and_save for:", status.filename);
              socket.emit("processURL", JSON.stringify({
                command: 'find_and_save',
                filePath: status.filename
              }));
            }
          }
        } else if (status.type === 'error') {
          console.log('Received error status:', status.message);
          if (!status.message?.toLowerCase().includes('failed to convert to wav')) {
            setState('error');
            toast.error(status.message);
            setTimeout(resetFormOnly, 1000);
          }
        } else if (status.type === 'info') {
          console.log('Received info message:', status.message);
          toast.info(status.message);
        }
      } catch (err) {
        console.error('Parse error:', err, 'Original message:', msg);
        if (typeof msg === 'string' && !msg.toLowerCase().includes('failed to convert to wav')) {
          toast.info(msg);
        }
      }
    });

    socket.on("provenanceMatch", (match) => {
      try {
        const parsedMatch = JSON.parse(match);
        const setResultObject = (prev => ({...prev, provenanceMatch: parsedMatch}))
        console.log('setting result to in socket handler for provenanceMatch:', setResultObject)
        setResult(setResultObject);
        setState('complete');
      } catch (err) {
        console.error('Error parsing provenance match:', err);
        toast.error('Error processing provenance match');
      }
    });

    socket.on("similarityResults", (matches) => {
      try {
        console.log("Received similarity results:", matches);
        const parsedMatches = JSON.parse(matches);
        setResult(prev => ({...prev, matches: parsedMatches}));
        setState('complete');
      } catch (err) {
        console.error('Error parsing similarity results:', err);
        toast.error('Error processing similarity results');
        setState('idle');
      }
    });

    socket.on("cacheStatus", (result) => {
      try {
        console.log("Received cache status:", result);
        const status = typeof result === 'string' ? JSON.parse(result) : result;
        
        if (status.found) {
          setState('fingerprinting');
          console.log("Found in cache, analyzing:", status.filePath);
          socket.emit("processURL", JSON.stringify({
            command: 'find_and_save',
            filePath: status.filePath
          }));
          toast.info("Song found in cache, analyzing...");
        } else {
          console.log("Not in cache, downloading:", status.url);
          socket.emit("processURL", JSON.stringify({
            url: status.url,
            type: status.type,
            command: 'download'
          }));
        }
      } catch (err) {
        console.error('Error parsing cache status:', err);
        toast.error('Error checking cache');
      }
    });

    return () => {
      socket.off("downloadStatus");
      socket.off("provenanceMatch");
      socket.off("similarityResults");
      socket.off("cacheStatus");
    };
  }, [socket]);

  const onSubmit = async (data: SpotifyUrlInput) => {
    try {
      console.log('Starting URL submission:', data.url);
      setState('downloading');
      console.log('setting result to empty in onSubmit')
      setResult({});
      
      const urlType = data.url.includes('/track/') ? 'track' :
                     data.url.includes('/album/') ? 'album' :
                     data.url.includes('/playlist/') ? 'playlist' : null;

      console.log('Detected URL type:', urlType);

      if (!urlType) {
        setState('error');
        toast.error('Invalid Spotify URL type');
        return;
      }

      const payload = {
        url: data.url,
        type: urlType,
        command: 'check_and_process'
      };
      
      console.log('Sending payload to server:', payload);
      socket.emit("processURL", JSON.stringify(payload));

      reset();
    } catch (error) {
      console.error("Error processing URL:", error);
      setState('error');
      toast.error("Failed to process URL");
      setTimeout(resetFormOnly, 1000);
    }
  };

  if (!socket) {
    return <div>Connecting to server...</div>;
  }

  return (
    <div className="url-processor">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="input-group">
          <input
            type="url"
            placeholder="Enter Spotify URL (track, album, or playlist)"
            disabled={state !== 'idle'}
            {...register('url')}
            className={errors.url ? 'error' : ''}
          />
          {errors.url && (
            <span className="error-message">{errors.url.message}</span>
          )}
        </div>
        
        <button 
          type="submit" 
          disabled={state !== 'idle'}
        >
          {state === 'idle' ? 'Process' : 'Processing...'}
        </button>
      </form>

      <div className="status">
        {state === 'downloading' && (
          <div className="status-message">
            <div className="spinner"></div>
            <span>Downloading audio...</span>
          </div>
        )}
        {state === 'fingerprinting' && (
          <div className="status-message">
            <div className="spinner"></div>
            <span>Analyzing audio fingerprint...</span>
          </div>
        )}
        {state === 'checking_provenance' && (
          <div className="status-message">
            <div className="spinner"></div>
            <span>Checking provenance...</span>
          </div>
        )}
        {state === 'error' && (
          <div className="status-message error">
            <span>Error occurred</span>
          </div>
        )}
      </div>

      {(state === 'complete' || (state === 'idle' && result.matches && result.matches.length > 0)) && (
        <div className="results">
          {result.provenanceMatch && (
            <div className="provenance-match">
              <h3>Provenance Match Found!</h3>
              <pre>{JSON.stringify(result.provenanceMatch, null, 2)}</pre>
            </div>
          )}
          {result.matches && result.matches.length > 0 && (
            <div className="similarity-matches">
              <h3>Similar Songs</h3>
              {result.matches.map((match: Match, index: number) => (
                <div key={index} className="match-item">
                  <h4>{match.SongTitle} by {match.SongArtist}</h4>
                  <p>Raw Score: {match.Score.toFixed(2)} matching fingerprints</p>
                  {match.blake3_hash && (
                    <div className="hash-info">
                      <p>Content Hash (BLAKE3):</p>
                      <code>{match.blake3_hash}</code>
                    </div>
                  )}
                  {match.YouTubeID && (
                    <div className="youtube-info">
                      <p>YouTube ID: {match.YouTubeID}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .url-processor {
          max-width: 600px;
          margin: 2rem auto;
          padding: 1rem;
        }

        form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          font-size: 1rem;
        }

        input.error {
          border-color: #ef4444;
        }

        .error-message {
          color: #ef4444;
          font-size: 0.875rem;
        }

        button {
          padding: 0.75rem 1.5rem;
          background-color: #3b82f6;
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        button:hover:not(:disabled) {
          background-color: #2563eb;
        }

        button:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }

        .status {
          margin-top: 1rem;
          text-align: center;
          color: #374151;
        }

        .results {
          margin-top: 2rem;
        }

        pre {
          background-color: #f3f4f6;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
        }

        .status-message {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          justify-content: center;
          margin: 1rem 0;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error {
          color: #ef4444;
        }

        .match-item {
          margin-bottom: 1.5rem;
          padding: 1rem;
          background-color: #f3f4f6;
          border-radius: 0.5rem;
        }

        .match-item h4 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
        }

        .hash-info {
          margin-top: 0.5rem;
        }

        .hash-info p {
          margin: 0;
          color: #4b5563;
          font-size: 0.875rem;
        }

        code {
          display: block;
          padding: 0.5rem;
          background-color: #e5e7eb;
          border-radius: 0.25rem;
          font-family: monospace;
          font-size: 0.875rem;
          word-break: break-all;
          margin-top: 0.25rem;
        }
      `}</style>
    </div>
  );
};

export default URLProcessor; 