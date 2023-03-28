function getTemplateInstallPackage(template?: string) {
  let templateToInstall = "cta-template";
  if (template) {
    // Add prefix 'cta-template-' to non-prefixed templates, leaving any
    // @scope/ and @version intact.
    const packageMatch = template.match(/^(@[^/]+\/)?([^@]+)?(@.+)?$/)!;
    const scope = packageMatch[1] || "";
    const templateName = packageMatch[2] || "";
    const version = packageMatch[3] || "";

    if (
      templateName === templateToInstall ||
      templateName.startsWith(`${templateToInstall}-`)
    ) {
      // Covers:
      // - cta-template
      // - @SCOPE/cta-template
      // - cta-template-NAME
      // - @SCOPE/cta-template-NAME
      templateToInstall = `${scope}${templateName}${version}`;
    } else if (version && !scope && !templateName) {
      // Covers using @SCOPE only
      templateToInstall = `${version}/${templateToInstall}`;
    } else {
      // Covers templates without the `cta-template` prefix:
      // - NAME
      // - @SCOPE/NAME
      templateToInstall = `${scope}${templateToInstall}-${templateName}${version}`;
    }
  }

  return Promise.resolve(templateToInstall);
}

export default getTemplateInstallPackage;
