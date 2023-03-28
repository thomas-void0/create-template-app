import { spawn } from "child_process";

function install(templateToInstall: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = "npm";
    const args = [
      "install",
      "--no-audit",
      "--save",
      "--save-exact",
      "--loglevel",
      "error",
    ].concat([templateToInstall]);

    const child = spawn(command, args, { stdio: "inherit" });

    child.stderr?.on("data", function () {
      reject(`${command} ${args.join(" ")} failed.`);
    });

    child.stdout?.on("data", function () {
      resolve(templateToInstall);
    });
  });
}

export default install;
