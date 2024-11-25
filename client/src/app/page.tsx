'use client';
import React from "react";
import { ToastContainer, Slide } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import AnimatedNumber from "../components/AnimatedNumber";
import io from "socket.io-client";

const server = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5005";
const socket = io(server);

// Dynamically import components with no SSR
const AudioListener = React.lazy(() => import("../components/AudioListener"));
const URLProcessor = React.lazy(() => import("../components/URLProcessor"));

const Page = (): JSX.Element => {
  const [totalSongs, setTotalSongs] = React.useState(10);

  React.useEffect(() => {
    socket.on("connect", () => {
      socket.emit("totalSongs", "");
    });

    socket.on("totalSongs", (songsCount) => {
      setTotalSongs(songsCount);
    });

    // Poll for total songs count
    const intervalId = setInterval(() => {
      socket.emit("totalSongs", "");
    }, 8000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="App">
      <div className="TopHeader">
        <h2 style={{ color: "#374151" }}>SeekTune</h2>
        <h4 style={{ display: "flex", justifyContent: "flex-end" }}>
          <AnimatedNumber
            includeComma={true}
            animateToNumber={totalSongs}
            fontStyle={{ color: "#374151" }}
            delay={0}
            onStart={() => {}}
            onFinish={() => {}}
          />
          &nbsp;Songs
        </h4>
      </div>

      <div className="main-content">
        <React.Suspense fallback={<div>Loading...</div>}>
          <AudioListener socket={socket} />
          <URLProcessor socket={socket} />
        </React.Suspense>
      </div>

      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={true}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        pauseOnHover
        theme="light"
        transition={Slide}
      />
    </div>
  );
};

export default Page;
