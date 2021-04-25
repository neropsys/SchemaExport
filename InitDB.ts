import { ResultSetHeader } from "mysql2";
import { MySql } from "./Database";

export async function InitRevisionDB(connection:MySql, targetDb:string){

    //리비전db 초기화
    //현재 리비전 번호 전용 db + 테이블 생성 및 저장
    await connection.query<ResultSetHeader>('CREATE DATABASE IF NOT EXISTS revision_db');
    await connection.query<ResultSetHeader>(
        `CREATE TABLE IF NOT EXISTS \`revision_db\`.\`tbl_revision\` (
                \`nextRevision\` BIGINT NOT NULL DEFAULT 0,
                \`dbName\` varchar(50) NOT NULL,
                PRIMARY KEY (\`dbName\`)
                )`);

}