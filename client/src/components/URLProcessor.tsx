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
    socket.on("downloadStatus", (msg) => {
      const status = JSON.parse(msg);
      if (status.type === 'success') {
        setState('fingerprinting');
      } else if (status.type === 'error') {
        setState('error');
        toast.error(status.message);
      }
      toast[status.type || 'info'](status.message);
    });

    socket.on("provenanceMatch", (match) => {
      const parsedMatch = JSON.parse(match);
      setResult(prev => ({ ...prev, provenanceMatch: parsedMatch }));
    });

    socket.on("similarityResults", (matches) => {
      const parsedMatches = JSON.parse(matches);
      setResult(prev => ({ ...prev, matches: parsedMatches }));
      setState('complete');
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
      socket.emit("processURL", JSON.stringify({ url: data.url }));
      reset(); // Clear the form after successful submission
    } catch (error) {
      console.error("Error processing URL:", error);
      setState('error');
      toast.error("Failed to process URL");
    }
  };

  return (
    <div className="url-processor">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="input-group">
          <input
            type="url"
            placeholder="Enter Spotify URL"
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
          Process
        </button>
      </form>

      {state !== 'idle' && (
        <div className="status">
          {state === 'downloading' && <div>Downloading...</div>}
          {state === 'fingerprinting' && <div>Analyzing audio...</div>}
          {state === 'checking_provenance' && <div>Checking provenance...</div>}
          {state === 'error' && <div>Error occurred</div>}
        </div>
      )}

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
      `}</style>
    </div>
  );
};

export default URLProcessor; 