const express = require("express");
const GarbageRequest = require("../models/CleanUpRequest");
const router = express.Router();
// All routes

// Fetch all requests with sorting, filtering, and searching
router.get("/requests", async (req, res) => {
  try {
    const { sort, filter, search } = req.query;

    // Build the query object
    const query = {};

    // Apply filters if any
    if (filter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: startOfDay };
    } else if (filter === "thisWeek") {
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      query.createdAt = { $gte: startOfWeek };
    } else if (filter === "thisMonth") {
      const startOfMonth = new Date();
      startOfMonth.setHours(0, 0, 0, 0);
      startOfMonth.setDate(1);
      query.createdAt = { $gte: startOfMonth };
    }

    // Apply search if any
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { plotCode: { $regex: search, $options: "i" } },
      ];
    }

    // Apply sorting
    const sortOptions = {};
    if (sort === "asc") {
      sortOptions.createdAt = 1; // Ascending order by creation date
    } else if (sort === "desc") {
      sortOptions.createdAt = -1; // Descending order by creation date
    } else if (sort === "plotCodeAsc") {
      sortOptions.plotCode = 1; // Ascending order by plotCode
    } else if (sort === "plotCodeDesc") {
      sortOptions.plotCode = -1; // Descending order by plotCode
    }

    // Fetch requests with the applied query and sort options
    const requests = await GarbageRequest.find(query).sort(sortOptions);

    res.json(requests);
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// Add a new request
router.post("/requests/add", async (req, res) => {
  try {
    const {
      plotCode,
      fullName,
      phoneNumber,
      numberOfBags,
      amountPaid,
      expectedAmount,
      status,
    } = req.body;

    // Validate required fields
    if (!plotCode || !fullName || !phoneNumber) {
      return res.status(400).json({
        error: "Plot Code, Full Name, and Phone Number are required.",
      });
    }

    const newRequest = new GarbageRequest({
      plotCode,
      fullName,
      phoneNumber,
      numberOfBags,
      amountPaid,
      expectedAmount,
      status,
    });

    await newRequest.save();
    res.status(201).json(newRequest);
  } catch (error) {
    console.error("Error adding request:", error);
    res.status(500).json({ error: "Failed to add request" });
  }
});

// Edit a request
router.patch("/request/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate required fields
    if (
      !updateData.plotCode ||
      !updateData.fullName ||
      !updateData.phoneNumber
    ) {
      return res.status(400).json({
        error: "Plot Code, Full Name, and Phone Number are required.",
      });
    }

    const updatedRequest = await GarbageRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error("Error updating request:", error);
    res.status(500).json({ error: "Failed to update request" });
  }
});

// Mark a request as paid
router.patch("/request/mark-paid/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const updatedRequest = await GarbageRequest.findByIdAndUpdate(
      id,
      { status: "paid" },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error("Error marking request as paid:", error);
    res.status(500).json({ error: "Failed to mark request as paid" });
  }
});

// Delete a request
router.delete("/request/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedRequest = await GarbageRequest.findByIdAndDelete(id);

    if (!deletedRequest) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ message: "Request deleted successfully" });
  } catch (error) {
    console.error("Error deleting request:", error);
    res.status(500).json({ error: "Failed to delete request" });
  }
});

module.exports = router;
