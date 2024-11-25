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

const URLProcessor: React.FC<Props> = ({ socket }) => {
  const [state, setState] = useState<URLProcessingState>('idle');
  const [result, setResult] = useState<ProcessingResult>({});

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<SpotifyUrlInput>({
    resolver: zodResolver(spotifyUrlSchema)
  });

  React.useEffect(() => {
    if (!socket) {
      console.log('Socket not initialized');
      return;
    }

    socket.on("downloadStatus", (msg) => {
      console.log("Received downloadStatus:", msg);
      try {
        if (typeof msg === 'string' && msg.toLowerCase().includes('failed to convert to wav')) {
          setState('fingerprinting');
          return;
        }

        const status = typeof msg === 'string' ? JSON.parse(msg) : msg;

        if (typeof status === 'string') {
          if (!status.toLowerCase().includes('failed to convert to wav')) {
            toast.info(status);
          }
          return;
        }

        if (status.type === 'success') {
          setState('fingerprinting');
          toast.success(status.message);
        } else if (status.type === 'error') {
          if (!status.message?.toLowerCase().includes('failed to convert to wav')) {
            setState('error');
            toast.error(status.message);
          } else {
            setState('fingerprinting');
          }
        } else {
          toast.info(status.message);
        }
      } catch (err) {
        if (typeof msg === 'string' && !msg.toLowerCase().includes('failed to convert to wav')) {
          toast.info(msg);
        }
      }
    });

    socket.on("provenanceMatch", (match) => {
      try {
        const parsedMatch = JSON.parse(match);
        setResult(prev => ({ ...prev, provenanceMatch: parsedMatch }));
        setState('complete');
      } catch (err) {
        console.error('Error parsing provenance match:', err);
        toast.error('Error processing provenance match');
      }
    });

    socket.on("similarityResults", (matches) => {
      try {
        const parsedMatches = JSON.parse(matches);
        setResult(prev => ({ ...prev, matches: parsedMatches }));
        setState('complete');
      } catch (err) {
        console.error('Error parsing similarity results:', err);
        toast.error('Error processing similarity results');
      }
    });

    return () => {
      socket.off("downloadStatus");
      socket.off("provenanceMatch");
      socket.off("similarityResults");
    };
  }, [socket]);

  const onSubmit = async (data: SpotifyUrlInput) => {
    try {
      setState('downloading');
      
      const urlType = data.url.includes('/track/') ? 'track' :
                     data.url.includes('/album/') ? 'album' :
                     data.url.includes('/playlist/') ? 'playlist' : null;

      if (!urlType) {
        setState('error');
        toast.error('Invalid Spotify URL type');
        return;
      }

      const payload = {
        url: data.url,
        type: urlType,
        command: 'download'
      };
      
      console.log('Sending URL to server:', payload);
      socket.emit("processURL", JSON.stringify(payload));

      reset();
    } catch (error) {
      console.error("Error processing URL:", error);
      setState('error');
      toast.error("Failed to process URL");
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

      {state === 'complete' && (
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
              <pre>{JSON.stringify(result.matches, null, 2)}</pre>
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
      `}</style>
    </div>
  );
};

export default URLProcessor; 