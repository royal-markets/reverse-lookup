'use client';

import React, { useState } from "react";
import styles from "./styles/Form.module.css";
import Input from './Input';

const SearchByURLForm = ({ socket, toast }) => {
  const initialState = { spotifyUrl: "" };
  const [formState, setFormState] = useState(initialState);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState({ ...formState, [name]: value });
  };

  const submitForm = (event) => {
    event.preventDefault();
    const { spotifyUrl } = formState;
    if (spotifyURLisValid(spotifyUrl) === false) {
      toast.error("Invalid Spotify URL");
      return;
    }

    socket.emit("newDownload", spotifyUrl);
    setFormState(initialState);
    toast.success("Song added to queue");
  };

  const spotifyURLisValid = (url) => {
    if (url.length === 0) {
      toast.error("Invalid Spotify URL");
      return false;
    }

    const splitURL = url.split("/");
    if (splitURL.length < 2) {
      toast.error("Invalid Spotify URL");
      return false;
    }

    return true;
  };

  const { spotifyUrl } = formState;

  return (
    <Input spotifyUrl={spotifyUrl} handleChange={handleChange} submitForm={submitForm} />
  );
};

export default SearchByURLForm;
