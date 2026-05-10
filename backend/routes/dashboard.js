/**
 * routes/dashboard.js
 *
 * Aggregazioni per la dashboard admin.
 * GET /api/dashboard/stats   — KPI principali
 * GET /api/dashboard/charts  — dati per grafici
 */
const express  = require("express");
const Product  = require("../models/Product");
const Movement = require("../models/Movement");
const User     = require("../models/User");
const Notification = require("../models/Notification");
const { protect }  = require("../middleware/auth");
const router       = express.Router();

router.use(protect);

// ── GET /api/dashboard/stats ──────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [
      totalProducts,
      lowStockCount,
      todayMovements,
      totalUsers,
      totalValue,
      unreadNotifications,
    ] = await Promise.all([
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, $expr: { $lte: ["$quantity","$minQuantity"] } }),
      Movement.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
      User.countDocuments({ isActive: true }),
      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, total: { $sum: { $multiply: ["$quantity","$unitPrice"] } } } },
      ]),
      Notification.countDocuments({
        $or: [{ userId: req.user._id }, { userId: null }],
        read: false,
      }),
    ]);

    // Ultimi 5 movimenti
    const recentMovements = await Movement.find()
      .populate("product",     "name code unit")
      .populate("performedBy", "name username")
      .sort("-createdAt")
      .limit(5)
      .lean();

    // Prodotti con scorta più bassa
    const criticalProducts = await Product.find({
      isActive: true,
      $expr: { $lte: ["$quantity","$minQuantity"] },
    })
      .populate("category", "name color")
      .sort("quantity")
      .limit(5)
      .lean();

    res.json({
      stats: {
        totalProducts,
        lowStockCount,
        todayMovements,
        totalUsers,
        totalValue: totalValue[0]?.total || 0,
        unreadNotifications,
      },
      recentMovements,
      criticalProducts: criticalProducts.map(p => ({ ...p, isLowStock: true })),
    });
  } catch (err) {
    console.error("[dashboard/stats]", err);
    res.status(500).json({ message: "Errore dashboard." });
  }
});

// ── GET /api/dashboard/charts — dati grafici ─────────────────
router.get("/charts", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Movimenti giornalieri (IN vs OUT)
    const dailyMovements = await Movement.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type",
          },
          count: { $sum: 1 },
          qty:   { $sum: "$quantity" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Distribuzione per categoria
    const byCategory = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$category", count: { $sum: 1 }, totalQty: { $sum: "$quantity" } } },
      { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "cat" } },
      { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      { $project: { name: { $ifNull: ["$cat.name","Senza categoria"] }, color: "$cat.color", count: 1, totalQty: 1 } },
    ]);

    // Top 10 prodotti per movimentazione
    const topProducts = await Movement.aggregate([
      { $match: { createdAt: { $gte: from } } },
      { $group: { _id: "$product", movements: { $sum: 1 }, totalQty: { $sum: "$quantity" } } },
      { $sort: { movements: -1 } },
      { $limit: 10 },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $project: { name: "$product.name", code: "$product.code", movements: 1, totalQty: 1 } },
    ]);

    res.json({ dailyMovements, byCategory, topProducts });
  } catch (err) {
    res.status(500).json({ message: "Errore grafici." });
  }
});

module.exports = router;
