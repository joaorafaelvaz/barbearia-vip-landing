import "dotenv/config";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.BARBEARIA_VIP_CLIENT = process.env.BARBEARIA_VIP_CLIENT ?? "mock";
process.env.IP_HASH_SALT = process.env.IP_HASH_SALT ?? "test-ip-salt";
process.env.PIN_SALT = process.env.PIN_SALT ?? "test-pin-salt";
