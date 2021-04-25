# SchemaExport
typescript+nodejs based db schema exporter
- https://github.com/neropsys/SchemaExport

## 사용한 패키지
mysql2 외 타입스크립트에서 필요한 각종 타입

@types/node@14.14.37
mysql2@2.2.5
ts-node@9.1.1

cli에서 실행시키기 위한 ts-node

## 작업환경
vs code, windows10, MySQL Community 8.0.16, node v14.13.1

## 실행
ts-node main.ts migrate
ts-node main.ts apply (DB이름)

## 기본 요구사항
connection.json의 mysql계정에 db생성, 테이블 생성 권한이 있어야 한다.
 - migration타깃 db의 현재 리비전을 별도의 db에 저장할 때 필요하다.
 - connection.json의 파일 구조 - main.ts와 같은 경로에 있어야한다
```
{
    "host"     : "localhost",
    "user"     : "root",
    "password" : "password",
    "database" : "dbname"
}
```
## 기본 가정사항
migration폴더 내 파일들은 임의로 삭제하지 않는다.
 - 임의로 구버전의 파일을 삭제할 시 새로운 db에 적용할 수 없다.

DB엔진은 InnoDB사용

## 제한 사항
 - Constraint의 경우 PRIMARY만 대응 가능하도록 구현
 - 데이터 타입의 경우 INT, BIGINT, VARCHAR같은 문자/숫자 타입만 대응 가능하도록 구현
 - 스토리지 타입의 경우 밑의 타입은 대응하지 않음
  - B(Binary)
  - G(Generated)
  - UN(Unique)
  - U(Unsigned)

## 전체 로직
### Migration
 - 첫 migration이 발생한 경우 타깃 DB의 모든 테이블 컬럼과 pkey를 로드 후 스냅샷 개념으로 파일에 저장
 - n번째 migration이 발생할 경우 n-1번째 migration 파일에 저장되어있는 스냅샷과 현재 DB의 테이블, 컬럼, pkey를 비교
  - 변경점이 발견되면 변경점을 신규 migration 파일에 저장
   - 테이블의 경우 새 테이블, 삭제 테이블을 감지하고 각 내역을 저장
   - 컬럼의 경우 컬럼의 순서, 타입, pkey, null, auto_increment, 및 삭제/추가된 컬럼 저장
### Apply
Apply 전 migration폴더 내에서 m개의 마이그레이션 파일을 확인

 - 첫 apply 발생 
   - revision_db 데이터베이스 및 tbl_revision 존재 여부 확인
   - 없을 경우 데이터베이스 & 테이블 생성
   - 0번째 migration파일의 db 스냅샷을 그대로 타깃 db에 적용
   - 1~m개의 migration파일부터 변경점만을 타깃 DB에 적용
  

 - n번째 apply 발생
   - revision_db 데이터베이스의 tbl_revision에서 타깃 db의 다음 마이그레이션 번호 n을 조회
   - n-1번째 migration파일에 저장되어있는 db스냅샷과 타깃db의 테이블들을 모두 비교
     - 다른점이 발견되었을 경우 error발생
   - n~m번째 migration파일 내 변경점들을 db에 적용

 - migration이 끝났으면 tbl_revision에 다음 마이그레이션이 될 마이그레이션 번호 m+1와 타깃 db이름을 저장


## migration(RevisionData) 파일 구조
 - DropTables: 드랍한 테이블 이름 리스트
 - AfterDB: 현재 migration파일에 저장되어있는 변경점을 DB에 적용한 결과.
 - DB스냅샷 역할을 하며, Apply 발생 시 타깃db에 변경점이 있는지 확인용
 - AfterDB: key값을 테이블 이름, value를 TableInfo로 저장하는 맵
   - TableInfo: Constraints를 저장하는 리스트 및 컬럼정보를 저장
     - Constraints: 
       - 이름, 
       - 참조 컬럼명 리스트,
       - 타입(Pkey, unique etc), 
       - Action(constraint의 수정/생성) 
     - Columns
       - 이름, 
       - 타입(varchar, int), 
       - Null(Nullable), 
       - Key(pkey, mul같은 constraint), 
       - Default(default값), 
       - Extra(auto_increment 등), 
       - Order(테이블 내 컬럼의 순서. 순서 변경시 해당값으로 정렬),
       - Action(컬럼의 수정/추가)
 - UpdateTables:
     - 이름,
     - Constraints: 변경된 constraint리스트
     - Columns: 변경된 column 리스트
     - DeletedColumns: 삭제된 column 리스트