'use strict';

const chalk = require('chalk');
const commander = require('commander');
const semver = require('semver');
const path = require('path');
const fs = require('fs-extra');
const spawn = require('cross-spawn');
const packageJson = require('./package.json');

function isUsingYarn() {
  return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
}

// 项目名称
let projectName;

function init() {
  new commander.Command(packageJson.name)
    .version(packageJson.version)
    .arguments('<project-directory>')
    .usage(`${chalk.green('<project-directory>')} [options]`)
    .action(name => {
      projectName = name;
    })
    .option('--verbose', 'print additional logs')
    .option('--info', 'print environment debug info')
    .option(
      '--template <path-to-template>',
      'specify a template for the created project'
    )
    .allowUnknownOption()
    .on('--help', () => {
      console.log(
        `    Only ${chalk.green('<project-directory>')} is required.`
      );
      console.log();
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-react-scripts'
        )}`
      );
      console.log();
      console.log(`    A custom ${chalk.cyan('--template')} can be one of:`);
      console.log(
        `      - a custom template published on npm: ${chalk.green(
          'cra-template-typescript'
        )}`
      );
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-custom-template'
        )}`
      );
      console.log(
        `      - a .tgz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tgz'
        )}`
      );
      console.log(
        `      - a .tar.gz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tar.gz'
        )}`
      );
      console.log();
      console.log(
        `    If you have any problems, do not hesitate to file an issue:`
      );
      console.log(
        `      ${chalk.cyan(
          'https://github.com/facebook/create-react-app/issues/new'
        )}`
      );
      console.log();
    })
    .parse(process.argv);


  const useYarn = isUsingYarn();
  createApp(
    projectName,
    useYarn,
  )
}

function createApp(name, useYarn) {
  // 检测node版本
  const unsupportedNodeVersion = !semver.satisfies(
    semver.coerce(process.version),
    '>=14'
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
  // 如果项目不存在，则创建
  fs.ensureDirSync(name);
  console.log(`创建一个新的模板 ${chalk.green(root)}.`);

  // todo 生成对应的模板

  const originalDirectory = process.cwd();
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
  } else if (usePnp) {
    const yarnInfo = checkYarnVersion();
    if (yarnInfo.yarnVersion) {
      if (!yarnInfo.hasMinYarnPnp) {
        console.log(
          chalk.yellow(
            `You are using Yarn ${yarnInfo.yarnVersion} together with the --use-pnp flag, but Plug'n'Play is only supported starting from the 1.12 release.\n\n` +
            `Please update to Yarn 1.12 or higher for a better, fully supported experience.\n`
          )
        );
        // 1.11 had an issue with webpack-dev-middleware, so better not use PnP with it (never reached stable, but still)
        usePnp = false;
      }
      if (!yarnInfo.hasMaxYarnPnp) {
        console.log(
          chalk.yellow(
            'The --use-pnp flag is no longer necessary with yarn 2 and will be deprecated and removed in a future release.\n'
          )
        );
        // 2 supports PnP by default and breaks when trying to use the flag
        usePnp = false;
      }
    }
  }

  run(
    root,
    appName,
    originalDirectory,
    useYarn,
  );
}


function run(
  root,
  appName,
  originalDirectory,
  useYarn,
) {
  Promise.resolve('react-template-vite').then(templateToInstall => {

    Promise.resolve({ name: templateToInstall }).then(templateInfo =>
      checkIfOnline(useYarn).then(isOnline => ({
        isOnline,
        templateInfo,
      }))
    )
      .then(async ({ templateInfo }) => {
        await executeNodeScript(
          {
            cwd: process.cwd(),
            args: [],
          },
          [root, originalDirectory, templateInfo.name],
          `
          const init = require('${originalDirectory.replace(/\\/g, '/')}/copyTemplate.js');
          init.apply(null, JSON.parse(process.argv[1]));
        `
        );
      })
      .catch(reason => {
        console.log();
        console.log('终止安装.');
        if (reason.command) {
          console.log(`  ${chalk.cyan(reason.command)} 失败.`);
        } else {
          console.log(
            chalk.red('异常错误')
          );
          console.log(reason);
        }
        console.log();

        const knownGeneratedFiles = ['package.json', 'node_modules'];
        const currentFiles = fs.readdirSync(path.join(root));
        currentFiles.forEach(file => {
          knownGeneratedFiles.forEach(fileToMatch => {
            if (file === fileToMatch) {
              console.log(`删除生成的文件... ${chalk.cyan(file)}`);
              fs.removeSync(path.join(root, file));
            }
          });
        });
        const remainingFiles = fs.readdirSync(path.join(root));
        if (!remainingFiles.length) {
          // 如果删除的目标根目录是空的，则从上一级开始删除
          console.log(
            `删除 ${chalk.cyan(`${appName}/`)} 从 ${chalk.cyan(
              path.resolve(root, '..')
            )}`
          );
          process.chdir(path.resolve(root, '..'));
          fs.removeSync(path.join(root));
        }
        console.log('终止.');
        process.exit(1);
      });
  });
}


function checkNpmVersion() {
  let hasMinNpm = false;
  let npmVersion = null;
  try {
    npmVersion = execSync('npm --version').toString().trim();
    hasMinNpm = semver.gte(npmVersion, '6.0.0');
  } catch (err) {
    // ignore
  }
  return {
    hasMinNpm: hasMinNpm,
    npmVersion: npmVersion,
  };
}

function checkYarnVersion() {
  const minYarnPnp = '1.12.0';
  const maxYarnPnp = '2.0.0';
  let hasMinYarnPnp = false;
  let hasMaxYarnPnp = false;
  let yarnVersion = null;
  try {
    yarnVersion = execSync('yarnpkg --version').toString().trim();
    if (semver.valid(yarnVersion)) {
      hasMinYarnPnp = semver.gte(yarnVersion, minYarnPnp);
      hasMaxYarnPnp = semver.lt(yarnVersion, maxYarnPnp);
    } else {
      // Handle non-semver compliant yarn version strings, which yarn currently
      // uses for nightly builds. The regex truncates anything after the first
      // dash. See #5362.
      const trimmedYarnVersionMatch = /^(.+?)[-+].+$/.exec(yarnVersion);
      if (trimmedYarnVersionMatch) {
        const trimmedYarnVersion = trimmedYarnVersionMatch.pop();
        hasMinYarnPnp = semver.gte(trimmedYarnVersion, minYarnPnp);
        hasMaxYarnPnp = semver.lt(trimmedYarnVersion, maxYarnPnp);
      }
    }
  } catch (err) {
    // ignore
  }
  return {
    hasMinYarnPnp: hasMinYarnPnp,
    hasMaxYarnPnp: hasMaxYarnPnp,
    yarnVersion: yarnVersion,
  };
}

function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      // Trying to read https-proxy from .npmrc
      let httpsProxy = execSync('npm config get https-proxy').toString().trim();
      return httpsProxy !== 'null' ? httpsProxy : undefined;
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
    childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
  } catch (err) {
    // Something went wrong spawning node.
    // Not great, but it means we can't do this check.
    // We might fail later on, but let's continue.
    return true;
  }
  if (typeof childOutput !== 'string') {
    return true;
  }
  const lines = childOutput.split('\n');
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  const prefix = '; cwd = ';
  const line = lines.find(line => line.startsWith(prefix));
  if (typeof line !== 'string') {
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
  if (process.platform === 'win32') {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
      `  ${chalk.cyan(
        'reg'
      )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
      `  ${chalk.cyan(
        'reg'
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

  return new Promise(resolve => {
    dns.lookup('registry.yarnpkg.com', err => {
      let proxy;
      if (err != null && (proxy = getProxy())) {
        // If a proxy is defined, we likely can't resolve external hostnames.
        // Try to resolve the proxy name as an indication of a connection.
        dns.lookup(url.parse(proxy).hostname, proxyErr => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}

function executeNodeScript({ cwd, args }, data, source) {
  // data [root, appName,  originalDirectory, templateName]
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-e', source, '--', JSON.stringify(data)],
      { cwd, stdio: 'inherit' }
    );

    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `node ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}


module.exports = {
  init,
};
