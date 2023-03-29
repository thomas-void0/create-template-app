import { exec } from "child_process";
import fs from "fs";

const gitignoreTemplate = `
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`;

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
      fs.writeFileSync(".gitignore", gitignoreTemplate);
      resolve("completed.");
    });
  });
}
export default generateGit;
