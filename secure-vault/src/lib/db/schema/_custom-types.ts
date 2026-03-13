import { customType } from "drizzle-orm/mysql-core";

export const mysqlBlob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "blob";
  },
});

export const mysqlLongBlob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "longblob";
  },
});

export const mysqlVector1536 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
});
