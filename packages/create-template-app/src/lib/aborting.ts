import chalk from "chalk";
import fs from "fs-extra";
import path from "path";

function aborting(root: string, appName: string) {
  // On 'exit' we will delete these files from target directory.
  const knownGeneratedFiles = ["package.json", "node_modules"];
  const currentFiles = fs.readdirSync(path.join(root));
  currentFiles.forEach((file) => {
    knownGeneratedFiles.forEach((fileToMatch) => {
      // This removes all knownGeneratedFiles.
      if (file === fileToMatch) {
        console.log(`Deleting generated file... ${chalk.cyan(file)}`);
        fs.removeSync(path.join(root, file));
      }
    });
  });
  const remainingFiles = fs.readdirSync(path.join(root));
  if (!remainingFiles.length) {
    // Delete target folder if empty
    console.log(
      `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
        path.resolve(root, "..")
      )}`
    );
    process.chdir(path.resolve(root, ".."));
    fs.removeSync(path.join(root));
  }
  console.log("Done.");
  process.exit(1);
}

export default aborting;
