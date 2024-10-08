const nodemon = require("nodemon");
const sendEmails = require("./send.js");

nodemon({
  script: "./bin/maildev",
  verbose: true,
  watch: ["src/*"],
  args: ["--verbose"],
})
  .on("start", function () {
    setTimeout(sendEmails, 1000);
  })
  .on("crash", function () {
    console.log("Nodemon process crashed");
  });
