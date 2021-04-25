
import fs = require('fs');
import { MySql } from "./Database";
import { Migrate } from "./Migrate";
import { Apply } from './Apply';
import { InitRevisionDB } from './InitDB';
const command = process.argv[2]
const targetDb = process.argv[3]

const migrationFolder = './migration';
const migrationDir = './migration/';
const connFile = './connection.json';
const connObj = JSON.parse(fs.readFileSync(connFile, 'utf8'));
const dbName = connObj.database;
const connection = new MySql(connObj);

if (!fs.existsSync(migrationFolder)) {
    fs.mkdirSync(migrationFolder);
}
const revisionIdx = fs.readdirSync(migrationDir).length;

(async () => {

    try {
        if (command === "migrate") {
            await Migrate(connection, dbName, revisionIdx, migrationDir);
        }
        else if (command === "apply") {
            //마이그레이션 파일이 없으므로 리턴
            if (revisionIdx === 0)
                return;
            await InitRevisionDB(connection, targetDb);
            await Apply(connection, revisionIdx, targetDb);
        }
        else throw new Error(`No such command:${command}`);

    }
    catch (err: any) {
        console.log(err);
    }
    finally {
        connection.close();
    }
})()