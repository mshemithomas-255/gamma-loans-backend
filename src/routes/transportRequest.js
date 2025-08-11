const express = require("express");
const TransportRequest = require("../models/transportRequest");

const router = express.Router();

// Submit transport request
router.post("/request", async (req, res) => {
  const {
    pickupLocation,
    destination,
    itemDescription,
    dateTime,
    contactInfo,
  } = req.body;

  if (
    !pickupLocation ||
    !destination ||
    !itemDescription ||
    !dateTime ||
    !contactInfo
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const newRequest = new TransportRequest({
      pickupLocation,
      destination,
      itemDescription,
      dateTime,
      contactInfo,
    });

    await newRequest.save();
    res.status(201).json({
      message: "Transport request submitted successfully",
      request: newRequest,
    });
  } catch (error) {
    console.error("Error saving transport request:", error);
    res.status(500).json({ error: "Failed to submit transport request" });
  }
});

// Get all transport requests (optional, for admin use)
router.get("/all-requests", async (req, res) => {
  try {
    const requests = await TransportRequest.find();
    res.status(200).json(requests);
  } catch (error) {
    console.error("Error fetching transport requests:", error);
    res.status(500).json({ error: "Failed to fetch transport requests" });
  }
});

// Update transport request status
router.put("/request/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const updatedRequest = await TransportRequest.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ error: "Transport request not found" });
    }

    res.status(200).json({
      message: "Transport request updated successfully",
      request: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating transport request:", error);
    res.status(500).json({ error: "Failed to update transport request" });
  }
});

module.exports = router;
