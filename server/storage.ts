export interface IStorage {}

class MemStorage implements IStorage {}

export const storage = new MemStorage();
