import { db } from './server/db.js';

async function addScheduleDateColumn() {
  try {
    console.log('Running migration: Adding schedule_date column to schedules table');
    
    await db.execute`
      ALTER TABLE schedules 
      ADD COLUMN IF NOT EXISTS schedule_date DATE;
    `;
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

addScheduleDateColumn();
