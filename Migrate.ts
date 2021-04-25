import { MySql } from "./Database";
import * as Types from "./Types";
import util = require('util');
import fs = require('fs');
import { GetColumnOrderAndIndex, GetChangedProps, GetRevision, GetTableNames, GetTableColumns, GetPrimaryKey as GetPkeyConstraint, IsConstraintChanged } from "./Util";
import { UpdateTableInfo } from "./Types";

const writeFile = util.promisify(fs.writeFile);

export async function Migrate(
    connection: MySql,
    dbName: string,
    revisionIdx: number,
    migrationDir: string) {
    //현재 db
    let currentDB = new Map<string, Types.TableInfo>();
    //이전 리비전의 db 스냅샷
    let beforeRevision: Types.RevisionData = new Types.RevisionData(null);
    //이전 db와 현재와 다른 테이블들의 변경점
    let updateTables: UpdateTableInfo[] = [];

    //테이블 이름 스캔
    const tableNames = await GetTableNames(connection, dbName);
    //이전 리비전이 있는 경우 이전 리비전의 currentDB를 읽어들임
    if (revisionIdx > 0) {
        beforeRevision = await GetRevision(revisionIdx - 1);
    }
    let dbChanged = false;
    //맵으로 각 테이블의 컬럼속성과 키를 조회하는 함수들 생성
    const rowInfos = tableNames.map(async (newTable: string) => {
        const curTableColumns = await GetTableColumns(connection, dbName, newTable);
        const pkeyConstraint = await GetPkeyConstraint(connection, newTable);

        currentDB.set(
            newTable,
            new Types.TableInfo(
                [pkeyConstraint],
                curTableColumns
            ));

        const beforeTable = beforeRevision.AfterDB.get(newTable);
        //이전에 없던 테이블이 생성되어있는 상태
        if (beforeTable === undefined) {
            dbChanged = true;
            let i = 0;
            curTableColumns.forEach(row => {
                row.Action = Types.Action.CREATE;
                row.Order = i++;
            });
            updateTables.push(new UpdateTableInfo(newTable, [pkeyConstraint], curTableColumns, []));
        }
        //업데이트가 발생하였는지 확인
        else {
            //업데이트가 발생한 컬럼 리스트
            let updates = [];
            //현재 DB의 컬럼마다 회전
            for (let i = 0; i < curTableColumns.length; i++) {

                let currentColumn = curTableColumns[i];
                currentColumn.Order = i;

                let orderIndexPair = GetColumnOrderAndIndex(currentColumn.Field, beforeTable.Columns);
                let beforeColumnOrder = orderIndexPair[0];
                let beforeColumnIndex = orderIndexPair[1];
                //새로운 컬럼
                if (beforeColumnOrder < 0) {
                    dbChanged = true;
                    currentColumn.Action = Types.Action.CREATE;
                    updates.push(currentColumn);
                }
                else {
                    let beforeColumn = beforeTable.Columns[beforeColumnIndex];
                    let changedProps = GetChangedProps(beforeColumn, currentColumn);
                    //바뀐 속성이 있는 경우
                    if (changedProps.size > 0) {
                        currentColumn.Action = Types.Action.UPDATE;
                        dbChanged = true;
                        updates.push(currentColumn);
                    }
                    //이전 테이블정보에서 컬럼정보 제거
                    beforeTable.Columns.splice(beforeColumnIndex, 1);
                }
            }
            //constraint 테이블 검증
            //constraint중 하나라도 다르거나 수량이 다를 경우 전체 constraint 추가
            if (IsConstraintChanged(beforeTable.Constraints, [pkeyConstraint])) {
                updates.push(pkeyConstraint);
            }

            //컬럼 삭제로 인해 이전 테이블 정보에 컬럼이 남은 상태
            beforeTable.Columns.forEach(deletedColumn => {
                dbChanged = true;
                deletedColumn.Action = Types.Action.DELETE;
                updates.push(deletedColumn);
            });

            if (updates.length > 0) {
                updateTables.push(new UpdateTableInfo(
                    newTable,
                    [pkeyConstraint],
                    curTableColumns,
                    beforeTable.Columns.map(columns => columns.Field)
                ));
            }
            //pkey확인
            //이전 db리스트에서 제거
            beforeRevision.AfterDB.delete(newTable);
        }

    });
    await Promise.all(rowInfos);

    //이전 버전의 테이블에 남은 테이블 정보가 있는 경우
    //이번 리비전에서 드랍처리된 테이블들만 남은 상태
    if (beforeRevision.AfterDB.size > 0) {
        dbChanged = true;
    }

    if (dbChanged) {
        const fileJson = new Types.ExportFileFormat(
            updateTables,
            currentDB,
            Array.from(beforeRevision.AfterDB.keys()));
        const modifiedStr = JSON.stringify(fileJson, null, "\t");

        await writeFile(`${migrationDir}${revisionIdx}.txt`, modifiedStr);
    }
}