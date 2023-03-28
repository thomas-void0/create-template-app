import { exec } from "child_process";
import fs from "fs";

function generateGit(): Promise<string> {
  return new Promise((resolve, reject) => {
    const existGit = fs.existsSync(".git");
    if (existGit) {
      return resolve("completed.");
    }
    exec("git init", (err) => {
      if (err) {
        return reject("Error: git init failed.");
      }
      resolve("completed.");
    });
  });
}
export default generateGit;
