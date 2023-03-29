#!/usr/bin/env node

"use strict";

import run from "./lib/run";

const currentNodeVersion = process.versions.node;
const semver = currentNodeVersion.split(".");
const major = semver[0];

if (+major < 14.16) {
  console.error(
    "You are running Node " +
      currentNodeVersion +
      ".\n" +
      "Create Template App requires Node 14.16 or higher. \n" +
      "Please update your version of Node."
  );
  process.exit(1);
}

run();
