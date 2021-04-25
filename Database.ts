
import mysql = require('mysql2');
export class MySql {
  connection: mysql.Connection;
  constructor(config:object) {
    this.connection = mysql.createConnection(config);
  }
  query<T extends mysql.RowDataPacket[][] | mysql.RowDataPacket[] | mysql.OkPacket | mysql.OkPacket[] | mysql.ResultSetHeader>(sql:string) {
    return new Promise<T>((resolve, reject) => {
      this.connection.query(sql, (err, rows) => {
        if (err)
          return reject(err);
        resolve(<T>rows);
      });
    });
  }
  close() {
    return new Promise<void>((resolve, reject) => {
      this.connection.end(err => {
        if (err)
          return reject(err);
        resolve();
      });
    });
  }
}

