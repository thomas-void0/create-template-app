import generateGit from "../lib/generateGit";

describe("generateGit", () => {
  it("generateGit test", () => {
    expect(generateGit()).resolves.toMatch("completed.");
  });
});
