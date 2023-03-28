import commander from "commander";
import chalk from "chalk";

export interface Options {
  projectName: string;
  template?: string;
}

function getOptions(): Options {
  let options: Options = {
    projectName: "",
  };
  const program = new commander.Command("create-template-app")
    .arguments("<project-directory>")
    .usage(`${chalk.green("<project-directory>")} [options]`)
    .action((name) => {
      options.projectName = name;
    })
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

  options = { ...options, ...program.opts() };

  return options as Options;
}

export default getOptions;
