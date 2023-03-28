import generateGit from "./generateGit";
import getOptions from "./getOptions";
import path from "path";
import chalk from "chalk";
import fs from "fs-extra";
import getTemplateInstallPackage from "./getTemplateInstallPackage";
import install from "./install";
import aborting from "./aborting";
import copyTemplate from "./copyTemplate";

async function run() {
  const options = getOptions();
  const { projectName, template } = options;
  const root = path.resolve(projectName);
  const appName = path.basename(root);

  fs.ensureDirSync(projectName);
  console.log(`Creating a new app in ${chalk.green(root)}.`);

  // 将工作进程目录提升到root
  process.chdir(root);

  const templateToInstall = await getTemplateInstallPackage(template);
  install(templateToInstall)
    .then((res) => {
      copyTemplate({
        appPath: root,
        appName,
        templateName: res,
      }).then(() => {
        generateGit()
          .then(() => {
            console.log();
            console.log(`Success! Created ${appName} at ${root}`);
            console.log();
            console.log("Happy hacking!");
          })
          .catch(() => aborting(root, appName));
      });
    })
    .catch((reason) => {
      console.log();
      console.log("Aborting installation.");
      if (reason.command) {
        console.log(`  ${chalk.cyan(reason.command)} has failed.`);
      } else {
        console.log(chalk.red("Unexpected error. Please report it as a bug:"));
        console.log(reason);
      }
      console.log();

      aborting(root, appName);
    });
}

export default run;
