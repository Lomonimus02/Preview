import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function addGradingSystemToClassesTable() {
  console.log("Running migration: Add grading_system to classes table");
  const tableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'classes' AND column_name = 'grading_system'
    );
  `;

  if (!tableExists[0].exists) {
    console.log("Adding grading_system column to classes table");
    await sql`
      ALTER TABLE classes 
      ADD COLUMN grading_system text DEFAULT 'five_point' NOT NULL;
    `;
    console.log("Added grading_system column to classes table");
  } else {
    console.log("Column grading_system already exists in classes table");
  }
}

async function createCumulativeGradingSystemTables() {
  console.log("Running migration: Create tables for cumulative grading system");
  
  // Create assignments table
  const assignmentsTableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'assignments'
    );
  `;
  
  if (!assignmentsTableExists[0].exists) {
    console.log("Creating assignments table");
    await sql`
      CREATE TABLE assignments (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL,
        assignment_type TEXT NOT NULL,
        max_score NUMERIC NOT NULL,
        teacher_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        subgroup_id INTEGER,
        description TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    console.log("Created assignments table");
  } else {
    console.log("Table assignments already exists");
  }

  // Create cumulative_grades table
  const cumulativeGradesTableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'cumulative_grades'
    );
  `;
  
  if (!cumulativeGradesTableExists[0].exists) {
    console.log("Creating cumulative_grades table");
    await sql`
      CREATE TABLE cumulative_grades (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        score NUMERIC NOT NULL,
        comment TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    console.log("Created cumulative_grades table");
  } else {
    console.log("Table cumulative_grades already exists");
  }
}

async function runMigrations() {
  try {
    // Add grading_system column to classes table
    await addGradingSystemToClassesTable();
    
    // Create cumulative grading system tables
    await createCumulativeGradingSystemTables();
    
    console.log("All migrations completed successfully!");
  } catch (error) {
    console.error("Error during migrations:", error);
  } finally {
    await sql.end();
    console.log("Connection closed");
  }
}

runMigrations();