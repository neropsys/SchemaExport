
import util = require('util');
import fs = require('fs');
const migrationDir = './migration/';
import * as Types from "./Types";
import { MySql } from './Database';
import { RowDataPacket } from 'mysql2';
const readFile = util.promisify(fs.readFile);

//이전 리비전 데이터 리턴
export async function GetRevision(revision: number):
    Promise<Types.RevisionData> {
    const revisionFile = await readFile(`${migrationDir}${revision}.txt`);
    return new Types.RevisionData(<Types.ExportFileFormat>JSON.parse(revisionFile.toString()));
}


//프로퍼티값이 다른 리스트를 리턴. 모두 같으면(변경사항이 없으면) 0 리턴
export function GetChangedProps(
    before: any,
    after: any) {
    const beforeProp = Object.getOwnPropertyNames(before);
    const ret = new Map<string, string>();
    for (let i = 0; i < beforeProp.length; i++) {
        const propName = beforeProp[i];
        if (propName === 'Action')
            continue;
        //pkey만 한정
        else if (propName === 'Key' && after[propName] !== "PRIMARY")
            continue;
        if (before[propName] !== after[propName]) {
            ret.set(propName, after[propName]);
        }
    }

    return ret;
}

//필드명으로 컬럼의 순서를 리턴해주는 함수
export function GetColumnOrderAndIndex(
    name: string,
    columns: Types.IColumnInfo[]): [number, number] {
    for (let i = 0; i < columns.length; i++) {
        if (columns[i].Field === name)
            return [columns[i].Order, i];
    }
    return [-1, -1];
}
//constraint바뀌었는지 비교하는 함수
export function IsConstraintChanged(
    befores: Types.ConstraintInfo[],
    afters: Types.ConstraintInfo[]) {
    if (befores.length !== afters.length)
        return true;

    for (let i = 0; i < befores.length; i++) {
        let before = befores[i];
        let after = afters[i];
        if (before.Name !== after.Name)
            return true;
        if (before.Type !== after.Type)
            return true;
        for (let j = 0; j < befores.length; j++) {
            if (before.Columns[j] !== after.Columns[j])
                return true;
        }
    }
    return false;
}
//각 컬럼의 속성을 쿼리문으로 변환시켜주는 함수
function CreateColumnQuery(column: Types.IColumnInfo, init:boolean): string {

    let nullType = column.Null === "YES" ? "NULL" : "NOT NULL";
    let defaultValue = column.Default;
    if (defaultValue === null) {
        if (nullType === 'NULL') {
            nullType = 'DEFAULT NULL';

        }
        defaultValue = '';
    }
    else {
        if (Number.isInteger(defaultValue)) {
            defaultValue = `DEFAULT ${defaultValue}`;
        }
        else {
            defaultValue = `DEFAULT '${defaultValue}'`;
        }
    }
    let action = `CHANGE COLUMN \`${column.Field}\` \`${column.Field}\``;

    if (init === true) {
        action = `\`${column.Field}\``;
    }
    else {
        if (column.Action === "CREATE") {
            action = `ADD COLUMN \`${column.Field}\``;
        }
    }
    return `${action} ${column.Type} ${nullType} ${defaultValue} ${column.Extra}`;

}
//컬럼과 테이블 이름으로 테이블 생성 쿼리를 만들어주는 함수
export function MakeCreateQuery(
    tableName: string,
    dbName: string,
    columns: Types.IColumnInfo[],
    constraints: Types.ConstraintInfo[],
    init:boolean) {
    let columnSqls = [];
    columns.forEach(column => {
        columnSqls.push(CreateColumnQuery(column, init));
    });
    
    constraints.forEach(constraint => {
        if (constraint.Type === 'PRIMARY' && constraint.Columns.length > 0) {
            columnSqls.push(`PRIMARY KEY (${constraint.Columns.join()})`);
        }
    });
    //unique, index etc
    return `CREATE TABLE \`${dbName}\`.\`${tableName}\` ( ${columnSqls.join()} )`;
}
//해당 db의 테이블에 alter 쿼리를 만들어주는 함수
export function MakeAlterQuery(
    tableName: string,
    dbName: string,
    columns: Types.IColumnInfo[],
    pkeyInfo: Types.ConstraintInfo,
    dropColumns: string[]) {

    let columnSqls = []
    if (dropColumns.length > 0) {
        columnSqls.push(dropColumns.map(column => `DROP COLUMN ${column}`).join());
    }
    columns.forEach((column, index) => {
        let sql = CreateColumnQuery(column, false);
        let order = 'FIRST';
        if (index > 0){
            order = `AFTER \`${columns[index - 1].Field}\``;
        }
        columnSqls.push(`${sql} ${order}`);
    });
    if (pkeyInfo.Type === 'PRIMARY') {
        columnSqls.push(`DROP PRIMARY KEY, ADD PRIMARY KEY (${pkeyInfo.Columns.join()})`);
    }

    //unique, index etc
    return `ALTER TABLE \`${dbName}\`.\`${tableName}\` ${columnSqls.join()};`;
}
//해당 DB의 테이블이름 리스트 리턴하는 함수
export async function GetTableNames(connection: MySql, dbName: string) {
    let results = await connection.query<RowDataPacket[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${dbName}'`);
    return results.map(result => <string>result.TABLE_NAME);
}
//해당 테이블 컬럼 이름 및 속성 리턴하는 함수
export async function GetTableColumns(connection: MySql, dbName: string, tableName: string) {
    return await connection.query<Types.IUpdateInfo[]>(`DESCRIBE ${dbName}.${tableName}`);
}
//해당 테이블의 pkey를 맵으로 리턴하는 함수
//key:constraint name, value: column list
export async function GetPrimaryKey(connection: MySql, tableName: string) {
    let constraints = await connection.query<Types.IConstraintInfo[]>(
        `SHOW KEYS FROM ${tableName} WHERE Key_name = 'PRIMARY'`);
    let columns: string[] = [];
    constraints.forEach(constraint => {
        columns.push(constraint.Column_name);
    });
    return new Types.ConstraintInfo("PRIMARY", columns, Types.ConstraintType.PRIMARY);
}