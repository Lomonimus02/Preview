import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

// Required because ESM doesn't support .ts extensions
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const drizzle = require('drizzle-orm');
const { sql } = drizzle;

async function addScheduleNotesColumn() {
  try {
    // Check if the notes column already exists
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedules' AND column_name = 'notes'
    `);
    
    // If the column doesn't exist, add it
    if (result.rows.length === 0) {
      console.log("Adding 'notes' column to schedules table...");
      await db.execute(sql`
        ALTER TABLE schedules
        ADD COLUMN notes TEXT
      `);
      console.log("Column 'notes' added successfully to schedules table");
    } else {
      console.log("Column 'notes' already exists in schedules table");
    }
  } catch (error) {
    console.error("Error adding 'notes' column to schedules table:", error);
    throw error;
  }
}

async function addScheduleDateColumn() {
  try {
    // Check if the schedule_date column already exists
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedules' AND column_name = 'schedule_date'
    `);
    
    // If the column doesn't exist, add it
    if (result.rows.length === 0) {
      console.log("Adding 'schedule_date' column to schedules table...");
      await db.execute(sql`
        ALTER TABLE schedules
        ADD COLUMN schedule_date DATE
      `);
      console.log("Column 'schedule_date' added successfully to schedules table");
    } else {
      console.log("Column 'schedule_date' already exists in schedules table");
    }
  } catch (error) {
    console.error("Error adding 'schedule_date' column to schedules table:", error);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log("Running database migrations...");
    
    // Add migrations here
    await addScheduleDateColumn();
    await addScheduleNotesColumn();
    
    console.log("All migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

// Run migrations
runMigrations();