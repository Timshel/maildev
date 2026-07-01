const nodemon = require("nodemon");
const sendEmails = require("./send.js");

nodemon({
  exec: "npm run build && node ./bin/maildev",
  verbose: true,
  watch: ["src/*"],
  args: ["--verbose"],
  ext: ".js, .ts, .html, .css",
})
  .on("start", function () {
    setTimeout(sendEmails, 1000);
  })
  .on("crash", function () {
    console.log("Nodemon process crashed");
  });
