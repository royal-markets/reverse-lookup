import { z } from "zod";

export type AudioListeningState = 
  | 'idle' 
  | 'listening'
  | 'processing'
  | 'complete'
  | 'error';

export type URLProcessingState = 
  | 'idle'
  | 'downloading'
  | 'fingerprinting'
  | 'checking_provenance' 
  | 'complete'
  | 'error';

export interface Match {
  songId: string;
  title: string;
  artist: string;
  similarity: number;
  url?: string;
}

export interface ProvenanceMatch {
  contentHash: string;
  timestamp: string;
  owner: string;
  metadata: {
    title?: string;
    artist?: string;
    [key: string]: any;
  }
}

export interface ProcessingResult {
  matches?: Match[];
  provenanceMatch?: ProvenanceMatch;
  error?: string;
}

// Spotify URL validation schema
export const spotifyUrlSchema = z.object({
  url: z.string()
    .url("Please enter a valid URL")
    .refine(
      (url) => {
        const spotifyPattern = /^https:\/\/open\.spotify\.com\/(track|album|playlist)\/[a-zA-Z0-9]+/;
        return spotifyPattern.test(url);
      },
      "Please enter a valid Spotify URL (track, album, or playlist)"
    )
});

export type SpotifyUrlInput = z.infer<typeof spotifyUrlSchema>; 