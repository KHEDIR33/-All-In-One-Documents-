require("dotenv").config();

const app = require("./app");

const PORT = process.env.PORT || 10000;


app.listen(PORT, () => {

    console.log(
        `All-In-One Documents API running on port ${PORT}`
    );

});
