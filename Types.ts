import { RowDataPacket } from "mysql2";

export const Action = {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE"
} as const;
export type Action = typeof Action[keyof typeof Action];

export const ConstraintType = {
    PRIMARY: "PRIMARY",
    UNIQUE: "UNIQUE",
    INDEX: "INDEX"
} as const;
export type ConstraintType = typeof ConstraintType[keyof typeof ConstraintType];

export interface IColumnInfo extends RowDataPacket {
    Field: string,
    Type: string,
    Null: string,
    Key: string,
    Default: string,
    Extra: string,
    Order: number,
}

export interface IUpdateInfo extends IColumnInfo {
    Action: Action,
}

export interface IConstraintInfo extends RowDataPacket {
    COLUMN_NAME: string,
    CONSTRAINT_NAME: string,
    REFERENCED_COLUMN_NAME: string,
    REFERENCED_TABLE_NAME: string,
    Action: Action,
}
export class ConstraintInfo {
    public Name: string;
    public Columns: string[];
    public Type: ConstraintType;
    public Action: Action = Action.CREATE;
    constructor(
        Name: string,
        Columns: string[],
        Type: ConstraintType) {
        this.Name = Name;
        this.Columns = Columns;
        this.Type = Type;
    }
}

export class UpdateTableInfo {
    public Name: string;
    public Constraints: ConstraintInfo[];
    public Columns: IColumnInfo[];
    public DeletedColumns: string[];
    constructor(
        Name: string,
        Constraints: ConstraintInfo[],
        Columns: IUpdateInfo[],
        DeletedColumns: string[]) {
        this.Name = Name;
        this.Constraints = Constraints;
        this.Columns = Columns;
        this.DeletedColumns = DeletedColumns;
    }

}
export class TableInfo {
    public Constraints: ConstraintInfo[];
    public Columns: IUpdateInfo[];
    constructor(Constraints: ConstraintInfo[], Columns: IUpdateInfo[]) {
        this.Constraints = Constraints;
        this.Columns = Columns;
    }
}
export class ExportFileFormat {

    public UpdateTables: UpdateTableInfo[];
    public AfterDB: object;
    public DropTables: string[];

    constructor(
        UpdateTables: UpdateTableInfo[],
        AfterDB: Map<string, TableInfo>,
        DropTables: string[]) {
        this.UpdateTables = UpdateTables;
        this.AfterDB = Object.fromEntries(AfterDB.entries());
        this.DropTables = DropTables;
    }
}
export class RevisionData {
    public UpdateTables: UpdateTableInfo[];
    public AfterDB: Map<string, TableInfo> = new Map<string, TableInfo>();
    public DropTables: string[];

    constructor(fileFormat: ExportFileFormat) {
        if (fileFormat != null) {
            this.UpdateTables = fileFormat.UpdateTables;
            this.AfterDB = new Map<string, TableInfo>
                (Object.entries(fileFormat.AfterDB));
            this.DropTables = fileFormat.DropTables;
        }
    }
}
