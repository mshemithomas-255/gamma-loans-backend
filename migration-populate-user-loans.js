// migration-populate-user-loans.js
const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./src/models/User");
const Loan = require("./src/models/Loan");

const migrateUserLoans = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB");

    // Step 1: Get all users and initialize empty loans array for each
    console.log("Initializing empty loans arrays for all users...");
    await User.updateMany(
      { loans: { $exists: true } },
      { $set: { loans: [] } }
    );

    // For users who don't have loans field yet
    await User.updateMany(
      { loans: { $exists: false } },
      { $set: { loans: [] } }
    );

    // Step 2: Get all loans and group by user
    console.log("Grouping loans by user...");
    const loansByUser = await Loan.aggregate([
      {
        $group: {
          _id: "$userId",
          loanIds: { $push: "$_id" },
          loanCount: { $sum: 1 },
        },
      },
      { $sort: { loanCount: -1 } },
    ]);

    console.log(`Found ${loansByUser.length} users with loans`);

    // Step 3: Update each user with their loan IDs
    let successCount = 0;
    let errorCount = 0;

    for (const userLoans of loansByUser) {
      try {
        // Check if user exists
        const userExists = await User.exists({ _id: userLoans._id });

        if (!userExists) {
          console.warn(
            `User ${userLoans._id} not found, skipping ${userLoans.loanCount} loans`
          );
          errorCount++;
          continue;
        }

        // Update user with loan IDs
        await User.findByIdAndUpdate(userLoans._id, {
          $set: { loans: userLoans.loanIds },
        });

        successCount++;
        if (successCount % 100 === 0) {
          console.log(`Processed ${successCount} users...`);
        }
      } catch (error) {
        console.error(`Error processing user ${userLoans._id}:`, error.message);
        errorCount++;
      }
    }

    // Step 4: Find orphaned loans (loans without valid users)
    console.log("Checking for orphaned loans...");
    const allLoans = await Loan.find({});
    const orphanedLoans = [];

    for (const loan of allLoans) {
      const userExists = await User.exists({ _id: loan.userId });
      if (!userExists) {
        orphanedLoans.push(loan._id);
      }
    }

    // Step 5: Verify the migration
    console.log("Verifying migration...");

    // Check users with loans in the database
    const usersWithLoans = await User.aggregate([
      { $match: { loans: { $exists: true, $ne: [] } } },
      { $project: { loanCount: { $size: "$loans" } } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalLoans: { $sum: "$loanCount" },
        },
      },
    ]);

    // Check total loans count
    const totalLoansCount = await Loan.countDocuments();

    console.log("\n=== MIGRATION SUMMARY ===");
    console.log(`Users processed successfully: ${successCount}`);
    console.log(`Users with errors: ${errorCount}`);
    console.log(`Orphaned loans (no user found): ${orphanedLoans.length}`);

    if (usersWithLoans.length > 0) {
      console.log(
        `Users with loans after migration: ${usersWithLoans[0].totalUsers}`
      );
      console.log(`Total loan references: ${usersWithLoans[0].totalLoans}`);
      console.log(`Actual loans in database: ${totalLoansCount}`);

      const discrepancy =
        totalLoansCount - usersWithLoans[0].totalLoans - orphanedLoans.length;
      console.log(`Data discrepancy: ${discrepancy}`);
    }

    if (orphanedLoans.length > 0) {
      console.log("\n=== ORPHANED LOANS ===");
      console.log(
        "These loans have user IDs that don't exist in the users collection:"
      );
      console.log(orphanedLoans);
    }

    console.log("\nMigration completed!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.connection.close();
    console.log("Database connection closed");
  }
};

// Run the migration with command line arguments
const runMigration = async () => {
  const args = process.argv.slice(2);

  if (args.includes("--dry-run")) {
    console.log("=== DRY RUN MODE ===");
    console.log("This would simulate the migration without making changes");
    // Add dry run logic here if needed
    return;
  }

  if (args.includes("--help")) {
    console.log(`
Usage: node migration-populate-user-loans.js [options]

Options:
  --dry-run    Simulate the migration without making changes
  --help       Show this help message
    `);
    return;
  }

  console.log("=== STARTING MIGRATION ===");
  console.log("This will populate the loans array for all users");
  console.log("Press Ctrl+C within 5 seconds to cancel...");

  // Give user time to cancel
  await new Promise((resolve) => setTimeout(resolve, 5000));

  await migrateUserLoans();
};

// Handle command line execution
if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { migrateUserLoans };
