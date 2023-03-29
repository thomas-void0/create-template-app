import spawn from "cross-spawn";

function install(templateToInstall: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = "npm";
    const args = [
      "install",
      "--no-audit", // https://github.com/facebook/create-react-app/issues/11174
      "--save",
      "--save-exact",
      "--loglevel",
      "error",
    ].concat([templateToInstall]);
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(" ")}`,
        });
        return;
      }
      resolve(templateToInstall);
    });
  });
}

export default install;
