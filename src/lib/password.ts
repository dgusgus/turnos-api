import bcrypt from "bcryptjs";

const COSTO = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COSTO);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
