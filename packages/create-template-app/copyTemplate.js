
'use strict';

process.on('unhandledRejection', err => {
  throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

module.exports = function (
  appPath,
  originalDirectory,
  templateName
) {
  const templatePath = path.resolve(originalDirectory, "..")
  const templateDir = path.join(templatePath, templateName);
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `无法找到提供的模板: ${chalk.green(templateDir)}`
    );
    return;
  }

  console.log('安装完成!');
};
