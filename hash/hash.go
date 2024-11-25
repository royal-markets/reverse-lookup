package hash

import (
    "encoding/hex"
    "io"
    "os"
    "github.com/zeebo/blake3"
)

// CalculateBlake3 calculates the BLAKE3 hash of a file
func CalculateBlake3(filepath string) (string, error) {
    file, err := os.Open(filepath)
    if err != nil {
        return "", err
    }
    defer file.Close()

    hasher := blake3.New()
    if _, err := io.Copy(hasher, file); err != nil {
        return "", err
    }

    // Return hex-encoded hash
    return hex.EncodeToString(hasher.Sum(nil)), nil
} 