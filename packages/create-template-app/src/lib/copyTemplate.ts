import chalk from "chalk";
import fs from "fs-extra";
import path from "path";

interface CopyTemplateParams {
  appPath: string;
  appName: string;
  templateName: string;
}

function emptyDir(dir: string, retain: string[]) {
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    !retain.includes(file) && fs.removeSync(file);
  });
}

function copyTemplate(arg: CopyTemplateParams): Promise<string> {
  return new Promise((resolve, reject) => {
    const { appPath, templateName } = arg;

    if (!templateName) {
      console.log("");
      console.error(
        `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan(
          "create-template-app"
        )}.`
      );
      reject();
    }

    const templatePath = path.dirname(
      require.resolve(`${templateName}/package.json`, { paths: [appPath] })
    );

    // Copy the files for the user
    const templateDir = path.join(templatePath, "template");

    if (!fs.existsSync(templateDir)) {
      console.error(
        `Could not locate supplied template: ${chalk.green(templateDir)}`
      );
      reject();
    }

    emptyDir(appPath, ["node_modules"]);

    // copy template resource
    fs.copySync(templateDir, appPath);

    fs.removeSync(`${appPath}/node_modules`);
    resolve(templateDir);
  });
}

export default copyTemplate;
