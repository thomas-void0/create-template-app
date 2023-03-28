import aborting from "../src/lib/aborting";

describe("aborting", () => {
  it("aborting test", () => {
    expect(aborting("/test", "my-app")).toBeCalled();
  });
});
