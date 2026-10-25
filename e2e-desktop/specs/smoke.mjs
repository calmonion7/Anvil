import { step } from "../helpers.mjs";

describe("스모크", () => {
  step("앱이 뜨고 제목이 Anvil", async () => {
    await expect(browser).toHaveTitle("Anvil");
  });
});
