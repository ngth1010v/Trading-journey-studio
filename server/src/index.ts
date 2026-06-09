import express from "express";

const app = express();

app.use(express.json());



//=============================================================================================
// INIT DATABASE
//=============================================================================================
import { marketDb } from "./database/market";
marketDb.Init();

//TEST
import "./modules/python-bridge/_test";

//TEST

//=============================================================================================
// OPEN PORT
//=============================================================================================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});