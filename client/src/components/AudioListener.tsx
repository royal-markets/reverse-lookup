'use client';
import React, { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { FaMicrophoneLines } from "react-icons/fa6";
import { LiaLaptopSolid } from "react-icons/lia";
import CarouselSliders from "./CarouselSliders";
import { toast } from "react-toastify";
import { AudioListeningState } from "../lib/types";

interface Props {
  socket: Socket;
}

const AudioListener: React.FC<Props> = ({ socket }) => {
  const [state, setState] = useState<AudioListeningState>('idle');
  const [stream, setStream] = useState<MediaStream>();
  const [matches, setMatches] = useState([]);
  const [audioInput, setAudioInput] = useState<'device' | 'mic'>('device');
  const [registeredMediaEncoder, setRegisteredMediaEncoder] = useState(false);
  const [isWideScreen, setIsWideScreen] = useState(true);

  const streamRef = useRef(stream);
  const sendRecordingRef = useRef(true);

  useEffect(() => {
    const checkScreenWidth = () => {
      setIsWideScreen(window.innerWidth > 550);
    };
    checkScreenWidth();
    window.addEventListener('resize', checkScreenWidth);
    return () => window.removeEventListener('resize', checkScreenWidth);
  }, []);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  const cleanUp = () => {
    const currentStream = streamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }
    setStream(undefined);
    setState('idle');
  };

  const stopListening = () => {
    cleanUp();
    sendRecordingRef.current = false;
  };

  const record = async () => {
    try {
      setState('listening');
      
      // Dynamically import media recorder modules
      const [{ MediaRecorder, register }, { connect }] = await Promise.all([
        import('extendable-media-recorder'),
        import('extendable-media-recorder-wav-encoder')
      ]);

      const mediaDevice =
        audioInput === "device"
          ? navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
          : navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      if (!registeredMediaEncoder) {
        await register(await connect());
        setRegisteredMediaEncoder(true);
      }

      const constraints = {
        audio: {
          autoGainControl: false,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          sampleSize: 16,
        },
        ...(audioInput === "device" ? { video: false } : {})
      };

      const stream = await mediaDevice(constraints);
      const audioTracks = stream.getAudioTracks();
      const audioStream = new MediaStream(audioTracks);

      setStream(audioStream);
      audioTracks[0].onended = stopListening;

      // Stop video tracks if they exist
      stream.getVideoTracks().forEach(track => track.stop());

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/wav",
      });

      mediaRecorder.start();
      sendRecordingRef.current = true;

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = function (e) {
        if (e.data) {
          chunks.push(e.data);
        }
      };

      setTimeout(() => mediaRecorder.stop(), 20000);

      mediaRecorder.addEventListener("stop", async () => {
        setState('processing');
        const blob = new Blob(chunks, { type: "audio/wav" });
        const reader = new FileReader();

        reader.readAsArrayBuffer(blob);
        reader.onload = async (event) => {
          if (!event.target?.result) return;
          
          const arrayBuffer = event.target.result as ArrayBuffer;
          const arrayBufferCopy = arrayBuffer.slice(0);
          
          const audioContext = new AudioContext();
          const audioBufferDecoded = await audioContext.decodeAudioData(arrayBufferCopy);
          const recordDuration = audioBufferDecoded.duration;

          const bytes = new Uint8Array(arrayBufferCopy);
          const binary = bytes.reduce((data, byte) => data + String.fromCharCode(byte), '');
          const rawAudio = btoa(binary);

          const audioConfig = audioStream.getAudioTracks()[0].getSettings();
          const recordData = {
            audio: rawAudio,
            duration: recordDuration,
            channels: audioConfig.channelCount,
            sampleRate: audioConfig.sampleRate,
            sampleSize: audioConfig.sampleSize,
          };

          if (sendRecordingRef.current) {
            socket.emit("newRecording", JSON.stringify(recordData));
          }
        };
      });
    } catch (error) {
      console.error("Recording error:", error);
      setState('error');
      toast.error("Failed to start recording");
      cleanUp();
    }
  };

  useEffect(() => {
    if (!socket) {
      console.log('Socket not initialized');
      return;
    }

    socket.on("matches", (matches) => {
      try {
        const parsedMatches = JSON.parse(matches);
        if (parsedMatches) {
          setMatches(parsedMatches.slice(0, 5));
          setState('complete');
        } else {
          setState('error');
          toast.error("No song found.");
        }
      } catch (err) {
        setState('error');
        toast.error("Error processing matches");
      }
      cleanUp();
    });

    return () => {
      cleanUp();
      socket.off("matches");
    };
  }, [socket]);

  // If socket is not available, show loading state
  if (!socket) {
    return <div>Connecting to server...</div>;
  }

  return (
    <div className="audio-listener">
      <div className="status-indicator">
        {state === 'listening' && (
          <div>
            Listening from {audioInput === 'device' ? 'computer audio' : 'microphone'}...
          </div>
        )}
        {state === 'processing' && <div>Processing...</div>}
        {state === 'error' && <div>Error occurred</div>}
      </div>

      <div className="controls">
        <button 
          onClick={state === 'idle' ? record : stopListening}
          disabled={state === 'processing'}
        >
          {state === 'idle' ? 'Start Listening' : 'Stop'}
        </button>

        {isWideScreen && (
          <div className="audio-input-selector">
            <div
              onClick={() => state === 'idle' && setAudioInput('device')}
              className={`audio-input-option ${audioInput === 'device' ? 'active' : ''}`}
              role="button"
              title="Listen from computer audio"
            >
              <LiaLaptopSolid />
              <span className="audio-input-label">Computer Audio</span>
            </div>
            <div
              onClick={() => state === 'idle' && setAudioInput('mic')}
              className={`audio-input-option ${audioInput === 'mic' ? 'active' : ''}`}
              role="button"
              title="Listen from microphone"
            >
              <FaMicrophoneLines />
              <span className="audio-input-label">Microphone</span>
            </div>
          </div>
        )}
      </div>

      {state === 'complete' && matches.length > 0 && (
        <CarouselSliders matches={matches} />
      )}

      <style jsx>{`
        .audio-listener {
          max-width: 600px;
          margin: 2rem auto;
          padding: 1rem;
        }

        .controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .audio-input-selector {
          display: flex;
          gap: 1rem;
          margin-top: 0.5rem;
        }

        .audio-input-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid #e5e7eb;
        }

        .audio-input-option:hover:not(:disabled) {
          background-color: #f3f4f6;
        }

        .audio-input-option.active {
          background-color: #e5e7eb;
          border-color: #d1d5db;
        }

        .audio-input-label {
          font-size: 0.875rem;
          color: #374151;
        }

        .status-indicator {
          text-align: center;
          margin-bottom: 1rem;
          min-height: 1.5rem;
          color: #374151;
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
      `}</style>
    </div>
  );
};

export default AudioListener; 