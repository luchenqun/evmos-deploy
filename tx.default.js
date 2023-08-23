import fs from "fs-extra";
import axios from "axios";
import util from "util";
import { exec } from "child_process";
const execPromis = util.promisify(exec);

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

const generateRandomString = (size) => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let randomString = "";
  for (let i = 0; i < size; i++) {
    const randomIndex = Math.floor(Math.random() * letters.length);
    const randomLetter = letters.charAt(randomIndex);
    randomString += randomLetter;
  }
  return randomString;
};

// Implement the logic you need here
export const main = async () => {
  try {
    const config = await fs.readJSON("./config.json");
    const baseUrl = "http://127.0.0.1";
    const rpc = `${baseUrl}:${config["tendermint"]["port"]["rpc.laddr"]}`;

    const randomString = generateRandomString(5);
    const url = `${rpc}/broadcast_tx_commit?tx="${randomString}"`;
    const rsp = await axios.get(url);
    console.log(rsp.data);
  } catch (error) {
    console.log("error:", error);
  }
};
