"use strict";

const chalk = require("chalk");
const commander = require("commander");
const dns = require("dns");
const envinfo = require("envinfo");
const execSync = require("child_process").execSync;
const fs = require("fs-extra");
const hyperquest = require("hyperquest");
const path = require("path");
const semver = require("semver");
const spawn = require("cross-spawn");
const tmp = require("tmp");
const unpack = require("tar-pack").unpack;
const url = require("url");
const validateProjectName = require("validate-npm-package-name");

const packageJson = require("./package.json");

function isUsingYarn() {
  return (process.env.npm_config_user_agent || "").indexOf("yarn") === 0;
}

let projectName;
function init() {
  const program = new commander.Command(packageJson.name)
    .version(packageJson.version)
    .arguments("<project-directory>")
    .usage(`${chalk.green("<project-directory>")} [options]`)
    .action((name) => {
      projectName = name;
    })
    .option("--info", "print environment debug info")
    .option(
      "--template <tempalte-type>",
      "specify a template for the created project"
    )
    .allowUnknownOption()
    .on("--help", () => {
      console.log(
        `    Only ${chalk.green("<project-directory>")} is required.`
      );
      console.log();
      console.log();
      console.log(`    A custom ${chalk.cyan("--template")} can be one of:`);
      console.log(
        `      - a custom template published on npm: ${chalk.green(
          "cta-template-mobile"
        )}`
      );
      console.log();
    })
    .parse(process.argv);

  const options = program.opts();

  if (program.info) {
    console.log(chalk.bold("\nEnvironment Info:"));
    console.log(
      `\n  current version of ${packageJson.name}: ${packageJson.version}`
    );
    console.log(`  running from ${__dirname}`);
    return envinfo
      .run(
        {
          System: ["OS", "CPU"],
          Binaries: ["Node", "npm", "Yarn"],
          Browsers: [
            "Chrome",
            "Edge",
            "Internet Explorer",
            "Firefox",
            "Safari",
          ],
          npmPackages: ["react", "react-dom", "react-scripts"],
          npmGlobalPackages: ["create-react-app"],
        },
        {
          duplicates: true,
          showNotFound: true,
        }
      )
      .then(console.log);
  }

  if (typeof projectName === "undefined") {
    console.error("Please specify the project directory:");
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green("<project-directory>")}`
    );
    console.log();
    console.log("For example:");
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green("my-react-app")}`
    );
    console.log();
    console.log(
      `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
    );
    process.exit(1);
  }

  createApp({
    name: projectName,
    template: options.template,
    useYarn: isUsingYarn(),
  });
}

function createApp({ name, template, useYarn }) {
  const unsupportedNodeVersion = !semver.satisfies(
    // Coerce strings with metadata (i.e. `15.0.0-nightly`).
    semver.coerce(process.version),
    ">=14"
  );

  if (unsupportedNodeVersion) {
    console.log(
      chalk.yellow(
        `You are using Node ${process.version} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
        `Please update to Node 14 or higher for a better, fully supported experience.\n`
      )
    );
  }

  const root = path.resolve(name);
  const appName = path.basename(root);

  checkAppName(appName);
  // 创建文件夹
  fs.ensureDirSync(name);
  if (!isSafeToCreateProjectIn(root, name)) {
    process.exit(1);
  }
  console.log();

  console.log(`Creating a new app in ${chalk.green(root)}.`);
  console.log();

  const originalDirectory = process.cwd();
  // 将工作进程目录提升到root
  process.chdir(root);
  if (!useYarn && !checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

  if (!useYarn) {
    const npmInfo = checkNpmVersion();
    if (!npmInfo.hasMinNpm) {
      if (npmInfo.npmVersion) {
        console.log(
          chalk.yellow(
            `You are using npm ${npmInfo.npmVersion} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
            `Please update to npm 6 or higher for a better, fully supported experience.\n`
          )
        );
      }
    }
  }

  run({
    root,
    appName,
    originalDirectory,
    template,
    useYarn,
  });
}


function run({ root, appName, originalDirectory, template, useYarn }) {
  getTemplateInstallPackage(template, originalDirectory).then(
    (templateToInstall) => {
      getPackageInfo(templateToInstall)
        .then((templateInfo) =>
          checkIfOnline(useYarn).then((isOnline) => ({
            isOnline,
            templateInfo,
          }))
        ).then(({ isOnline, templateInfo }) => {
          return install({
            root,
            useYarn,
            dependencies: [templateToInstall],
            isOnline
          }).then(() => ({
            templateInfo,
          }));
        })
        .then(({ templateInfo }) => {
          downloadTemplate({
            appPath: root,
            useYarn,
            appName,
            templateName: templateInfo.name,
          });
        })
        .catch((reason) => {
          console.log();
          console.log("Aborting installation.");
          if (reason.command) {
            console.log(`  ${chalk.cyan(reason.command)} has failed.`);
          } else {
            console.log(
              chalk.red("Unexpected error. Please report it as a bug:")
            );
            console.log(reason);
          }
          console.log();

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
        });
    }
  );
}

function install({ root, useYarn, dependencies, isOnline }) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (useYarn) {
      command = 'yarnpkg';
      args = ['add', '--exact'];
      if (!isOnline) {
        args.push('--offline');
      }
      [].push.apply(args, dependencies);

      // Explicitly set cwd() to work around issues like
      // https://github.com/facebook/create-react-app/issues/3326.
      // Unfortunately we can only do this for Yarn because npm support for
      // equivalent --prefix flag doesn't help with this issue.
      // This is why for npm, we run checkThatNpmCanReadCwd() early instead.
      args.push('--cwd');
      args.push(root);

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'));
        console.log(chalk.yellow('Falling back to the local Yarn cache.'));
        console.log();
      }
    } else {
      command = 'npm';
      args = [
        'install',
        '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
        '--save',
        '--save-exact',
        '--loglevel',
        'error',
      ].concat(dependencies);

    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

function downloadTemplate({ appPath, useYarn, appName, templateName }) {
  if (!templateName) {
    console.log("");
    console.error(
      `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan(
        "create-template-app"
      )}.`
    );
    return;
  }

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  // Copy the files for the user
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    // 删除pkg,pkg.lock or yarn.lock
    fs.removeSync(`${templateDir}/package.json`)
    fs.removeSync(`${templateDir}/package-lock.json`)
    fs.removeSync(`${templateDir}/yarn.lock`)
    fs.copySync(templateDir, appPath);
    fs.removeSync(`${templateDir}/node_modules`)
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
  }

  // let command;
  // let remove;
  // let args;

  // if (useYarn) {
  //   command = 'yarnpkg';
  //   remove = 'remove';
  //   args = ['add'];
  // } else {
  //   command = 'npm';
  //   remove = 'uninstall';
  //   args = [
  //     'install',
  //     '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
  //     '--save',
  //   ].filter(e => e);
  // }

  // // Remove template
  // console.log(`Removing template package using ${command}...`);
  // console.log();

  // const proc = spawn.sync(command, [remove, templateName], {
  //   stdio: 'inherit',
  // });
  // if (proc.status !== 0) {
  //   console.error(`\`${command} ${args.join(' ')}\` failed`);
  //   return;
  // }

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log();
  console.log("Happy hacking!");
}

function getTemplateInstallPackage(template, originalDirectory) {
  let templateToInstall = "cta-template";
  if (template) {
    if (template.match(/^file:/)) {
      templateToInstall = `file:${path.resolve(
        originalDirectory,
        template.match(/^file:(.*)?$/)[1]
      )}`;
    } else if (
      template.includes("://") ||
      template.match(/^.+\.(tgz|tar\.gz)$/)
    ) {
      // for tar.gz or alternative paths
      templateToInstall = template;
    } else {
      // Add prefix 'cta-template-' to non-prefixed templates, leaving any
      // @scope/ and @version intact.
      const packageMatch = template.match(/^(@[^/]+\/)?([^@]+)?(@.+)?$/);
      const scope = packageMatch[1] || "";
      const templateName = packageMatch[2] || "";
      const version = packageMatch[3] || "";

      if (
        templateName === templateToInstall ||
        templateName.startsWith(`${templateToInstall}-`)
      ) {
        // Covers:
        // - cra-template
        // - @SCOPE/cra-template
        // - cra-template-NAME
        // - @SCOPE/cra-template-NAME
        templateToInstall = `${scope}${templateName}${version}`;
      } else if (version && !scope && !templateName) {
        // Covers using @SCOPE only
        templateToInstall = `${version}/${templateToInstall}`;
      } else {
        // Covers templates without the `cra-template` prefix:
        // - NAME
        // - @SCOPE/NAME
        templateToInstall = `${scope}${templateToInstall}-${templateName}${version}`;
        console.log("键入else:", templateToInstall);
      }
    }
  }

  return Promise.resolve(templateToInstall);
}

function getTemporaryDirectory() {
  return new Promise((resolve, reject) => {
    // Unsafe cleanup lets us recursively delete the directory if it contains
    // contents; by default it only allows removal if it's empty
    tmp.dir({ unsafeCleanup: true }, (err, tmpdir, callback) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          tmpdir: tmpdir,
          cleanup: () => {
            try {
              callback();
            } catch (ignored) {
              // Callback might throw and fail, since it's a temp directory the
              // OS will clean it up eventually...
            }
          },
        });
      }
    });
  });
}

function extractStream(stream, dest) {
  return new Promise((resolve, reject) => {
    stream.pipe(
      unpack(dest, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(dest);
        }
      })
    );
  });
}

// Extract package name from tarball url or path.
function getPackageInfo(installPackage) {
  if (installPackage.match(/^.+\.(tgz|tar\.gz)$/)) {
    return getTemporaryDirectory()
      .then((obj) => {
        let stream;
        if (/^http/.test(installPackage)) {
          stream = hyperquest(installPackage);
        } else {
          stream = fs.createReadStream(installPackage);
        }
        return extractStream(stream, obj.tmpdir).then(() => obj);
      })
      .then((obj) => {
        const { name, version } = require(path.join(
          obj.tmpdir,
          "package.json"
        ));
        obj.cleanup();
        return { name, version };
      })
      .catch((err) => {
        // The package name could be with or without semver version, e.g. react-scripts-0.2.0-alpha.1.tgz
        // However, this function returns package name only without semver version.
        console.log(
          `Could not extract the package name from the archive: ${err.message}`
        );
        const assumedProjectName = installPackage.match(
          /^.+\/(.+?)(?:-\d+.+)?\.(tgz|tar\.gz)$/
        )[1];
        console.log(
          `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
        );
        return Promise.resolve({ name: assumedProjectName });
      });
  } else if (installPackage.startsWith("git+")) {
    // Pull package name out of git urls e.g:
    // git+https://github.com/mycompany/react-scripts.git
    // git+ssh://github.com/mycompany/react-scripts.git#v1.2.3
    return Promise.resolve({
      name: installPackage.match(/([^/]+)\.git(#.*)?$/)[1],
    });
  } else if (installPackage.match(/.+@/)) {
    // Do not match @scope/ when stripping off @version or @tag
    return Promise.resolve({
      name: installPackage.charAt(0) + installPackage.substr(1).split("@")[0],
      version: installPackage.split("@")[1],
    });
  } else if (installPackage.match(/^file:/)) {
    const installPackagePath = installPackage.match(/^file:(.*)?$/)[1];
    const { name, version } = require(path.join(
      installPackagePath,
      "package.json"
    ));
    return Promise.resolve({ name, version });
  }
  return Promise.resolve({ name: installPackage });
}

function checkNpmVersion() {
  let hasMinNpm = false;
  let npmVersion = null;
  try {
    npmVersion = execSync("npm --version").toString().trim();
    hasMinNpm = semver.gte(npmVersion, "6.0.0");
  } catch (err) {
    // ignore
  }
  return {
    hasMinNpm: hasMinNpm,
    npmVersion: npmVersion,
  };
}

function checkAppName(appName) {
  const validationResult = validateProjectName(appName);
  if (!validationResult.validForNewPackages) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because of npm naming restrictions:\n`
      )
    );
    [
      ...(validationResult.errors || []),
      ...(validationResult.warnings || []),
    ].forEach((error) => {
      console.error(chalk.red(`  * ${error}`));
    });
    console.error(chalk.red("\nPlease choose a different project name."));
    process.exit(1);
  }

  // TODO: there should be a single place that holds the dependencies
  const dependencies = ["react", "react-dom", "react-scripts"].sort();
  if (dependencies.includes(appName)) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because a dependency with the same name exists.\n` +
        `Due to the way npm works, the following names are not allowed:\n\n`
      ) +
      chalk.cyan(dependencies.map((depName) => `  ${depName}`).join("\n")) +
      chalk.red("\n\nPlease choose a different project name.")
    );
    process.exit(1);
  }
}


// If project only contains files generated by GH, it’s safe.
// Also, if project contains remnant error logs from a previous
// installation, lets remove them now.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebook/create-react-app/pull/368#issuecomment-243446094
function isSafeToCreateProjectIn(root, name) {
  const validFiles = [
    ".DS_Store",
    ".git",
    ".gitattributes",
    ".gitignore",
    ".gitlab-ci.yml",
    ".hg",
    ".hgcheck",
    ".hgignore",
    ".idea",
    ".npmignore",
    ".travis.yml",
    "docs",
    "LICENSE",
    "README.md",
    "mkdocs.yml",
    "Thumbs.db",
  ];
  // These files should be allowed to remain on a failed install, but then
  // silently removed during the next create.
  const errorLogFilePatterns = [
    "npm-debug.log",
    "yarn-error.log",
    "yarn-debug.log",
  ];
  const isErrorLog = (file) => {
    return errorLogFilePatterns.some((pattern) => file.startsWith(pattern));
  };

  const conflicts = fs
    .readdirSync(root)
    .filter((file) => !validFiles.includes(file))
    // IntelliJ IDEA creates module files before CRA is launched
    .filter((file) => !/\.iml$/.test(file))
    // Don't treat log files from previous installation as conflicts
    .filter((file) => !isErrorLog(file));

  if (conflicts.length > 0) {
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      try {
        const stats = fs.lstatSync(path.join(root, file));
        if (stats.isDirectory()) {
          console.log(`  ${chalk.blue(`${file}/`)}`);
        } else {
          console.log(`  ${file}`);
        }
      } catch (e) {
        console.log(`  ${file}`);
      }
    }
    console.log();
    console.log(
      "Either try using a new directory name, or remove the files listed above."
    );

    return false;
  }

  // Remove any log files from a previous installation.
  fs.readdirSync(root).forEach((file) => {
    if (isErrorLog(file)) {
      fs.removeSync(path.join(root, file));
    }
  });
  return true;
}

function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      // Trying to read https-proxy from .npmrc
      let httpsProxy = execSync("npm config get https-proxy").toString().trim();
      return httpsProxy !== "null" ? httpsProxy : undefined;
    } catch (e) {
      return;
    }
  }
}

// See https://github.com/facebook/create-react-app/pull/3355
function checkThatNpmCanReadCwd() {
  const cwd = process.cwd();
  let childOutput = null;
  try {
    // Note: intentionally using spawn over exec since
    // the problem doesn't reproduce otherwise.
    // `npm config list` is the only reliable way I could find
    // to reproduce the wrong path. Just printing process.cwd()
    // in a Node process was not enough.
    childOutput = spawn.sync("npm", ["config", "list"]).output.join("");
  } catch (err) {
    // Something went wrong spawning node.
    // Not great, but it means we can't do this check.
    // We might fail later on, but let's continue.
    return true;
  }
  if (typeof childOutput !== "string") {
    return true;
  }
  const lines = childOutput.split("\n");
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  const prefix = "; cwd = ";
  const line = lines.find((line) => line.startsWith(prefix));
  if (typeof line !== "string") {
    // Fail gracefully. They could remove it.
    return true;
  }
  const npmCWD = line.substring(prefix.length);
  if (npmCWD === cwd) {
    return true;
  }
  console.error(
    chalk.red(
      `Could not start an npm process in the right directory.\n\n` +
      `The current directory is: ${chalk.bold(cwd)}\n` +
      `However, a newly started npm process runs in: ${chalk.bold(
        npmCWD
      )}\n\n` +
      `This is probably caused by a misconfigured system terminal shell.`
    )
  );
  if (process.platform === "win32") {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
      `  ${chalk.cyan(
        "reg"
      )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
      `  ${chalk.cyan(
        "reg"
      )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
      chalk.red(`Try to run the above two lines in the terminal.\n`) +
      chalk.red(
        `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
      )
    );
  }
  return false;
}

function checkIfOnline(useYarn) {
  if (!useYarn) {
    // Don't ping the Yarn registry.
    // We'll just assume the best case.
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    dns.lookup("registry.yarnpkg.com", (err) => {
      let proxy;
      if (err != null && (proxy = getProxy())) {
        // If a proxy is defined, we likely can't resolve external hostnames.
        // Try to resolve the proxy name as an indication of a connection.
        dns.lookup(url.parse(proxy).hostname, (proxyErr) => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}

module.exports = {
  init,
};

