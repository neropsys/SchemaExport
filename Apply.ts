import { ResultSetHeader, RowDataPacket } from "mysql2";
import { MySql } from "./Database";
import { GetChangedProps, GetRevision as GetRevisionByNumber, GetTableColumns, GetTableNames, MakeAlterQuery, MakeCreateQuery } from "./Util";


async function InitTables(connection: MySql, targetDb: string) {
    let firstRevision = await GetRevisionByNumber(0);

    let tableCreateQueries = [];

    for (const [name, tables] of firstRevision.AfterDB.entries()) {
        tableCreateQueries.push(
            MakeCreateQuery(
                name,
                targetDb,
                tables.Columns,
                tables.Constraints,
                true));
    }

    for (const query of tableCreateQueries) {
        await connection.query<ResultSetHeader>(query);
    }
}

async function CheckDB(
    connection: MySql,
    targetDb: string,
    revisionNo: number) {
    //현재 DB상태와 마이그레이션 파일에 저장되어있는 DB상태가 일치하는지 검증
    let lastRevision = await GetRevisionByNumber(revisionNo);
    let curTableNames = await GetTableNames(connection, targetDb);
    //for문으로 순차적으로 순회할 경우 최선의 경우 바로 끝날 수 있지만
    //최악의 경우 끝의 db가 없을 수 있다.
    //따라서 동시에 실행되는 Promise.all로 테이블과 컬럼속성까지 모두 검증
    const tablePromises = curTableNames.map(async (tableName) => {
        //이전 리비전에 없던 테이블이 있는 경우
        let lastTable = lastRevision.AfterDB.get(tableName);
        if (lastTable === undefined) {
            throw new Error(
                `Current DB state does not match with last revision No.${lastRevision}`
            );
        }
        const curColumns = await GetTableColumns(connection, targetDb, tableName);
        //컬럼의 수가 다른 경우
        if (curColumns.length !== lastTable.Columns.length) {
            throw new Error(
                `Current DB state does not match with last revision No.${lastRevision}`
            );
        }
        //컬럼의 속성이 다른 경움
        for (let i = 0; i < curColumns.length; i++) {
            const difference = GetChangedProps(curColumns[i], lastTable.Columns[i]);
            if (difference.size > 0) {
                throw new Error(
                    `Current DB state does not match with last revision No.${lastRevision}`
                );
            }
        }
    });
    await Promise.all(tablePromises);
}
export async function Apply(
    connection: MySql,
    revisionIdx: number,
    targetDb: string) {
    //현재db의 리비전 조회
    let nextRevision = await connection.query<RowDataPacket[]>(
        `SELECT nextRevision FROM revision_db.tbl_revision WHERE dbName = '${targetDb}'`);

    //db 내 리비전 번호 초기화 또는 get
    let revisionNo = 0;
    if (nextRevision.length === 0) {
        await connection.query<ResultSetHeader>(
            `INSERT INTO revision_db.tbl_revision (nextRevision, dbName)  values(1, '${targetDb}')`);

    }
    else {
        revisionNo = nextRevision[0].nextRevision;
    }

    //첫 마이그레이션은 0번 마이그레이션 파일의 AfterDB로 초기화
    if (revisionNo === 0) {
        await InitTables(connection, targetDb);
        console.log(`DB Migration Successful. Revision:${revisionNo}`);
        revisionNo = 1;
    }
    //전버전의 리비전 DB와 비교
    await CheckDB(connection, targetDb, revisionNo - 1)

    //db 리비전의 다음 리비전부터 끝 리비전까지 update적용
    for (let i = revisionNo; i < revisionIdx; i++) {
        let curRevision = await GetRevisionByNumber(i);
        let curTables = new Set(await GetTableNames(connection, targetDb));
        //기존의 테이블 수정사항 업데이트
        for (const table of curRevision.UpdateTables) {
            let query = '';
            if (curTables.has(table.Name)) {
                query = MakeAlterQuery(
                    table.Name,
                    targetDb,
                    table.Columns,
                    table.Constraints[0],
                    table.DeletedColumns
                );
            }
            //기존에 없는 경우 신규 테이블
            else {
                query = MakeCreateQuery(
                    table.Name,
                    targetDb,
                    table.Columns,
                    table.Constraints,
                    true
                );
            }

            await connection.query<ResultSetHeader>(query);
        }
        //드롭한 테이블이 있을 경우 드롭
        if (curRevision.DropTables.length > 0) {
            let dropSql = curRevision.DropTables.map(
                dropTable => `\`${targetDb}\`.\`${dropTable}\``)
                .join();
            await connection.query<ResultSetHeader>(`DROP TABLE ${dropSql}`);
        }

    }
    //업데이트 대상이 될 다음 리비전을 등록
    await connection.query<ResultSetHeader>(
        `UPDATE revision_db.tbl_revision SET nextRevision = ${revisionIdx} WHERE dbName = '${targetDb}'`);
}