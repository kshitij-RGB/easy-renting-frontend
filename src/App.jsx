import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { addDays, eachDayOfInterval } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { addDays, eachDayOfInterval } from 'date-fns';
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import './App.css';

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const ImageCarousel = ({ images, isDetail = false }) => (
  <div className={isDetail ? "carousel-detail" : "carousel-card"}>
    <div className="carousel-inner">
      {images?.map((url, i) => <img key={i} src={url} alt="product" className="carousel-img" />)}
    </div>
  </div>
);

const Marketplace = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('All');
  const [maxPrice, setMaxPrice] = useState(1000);
  const [sortBy, setSortBy] = useState('newest');
  const navigate = useNavigate();

  useEffect(() => { fetch('https://easy-renting-api.onrender.com/api/items').then(res => res.json()).then(setItems); }, []);

  const categories = ['All', 'Clothing', 'Electronics', 'Tools', 'Vehicles', 'Other'];

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) || item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = category === 'All' || (item.category || 'Other') === category;
    const matchesPrice = item.pricePerDay <= maxPrice;
    return matchesSearch && matchesCategory && matchesPrice;
  }).sort((a, b) => {
    if (sortBy === 'price-asc') return a.pricePerDay - b.pricePerDay;
    if (sortBy === 'price-desc') return b.pricePerDay - a.pricePerDay;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <div className="container">
      <div className="hero"><h1>Premium Rentals.</h1><p>Curated luxury items at your fingertips.</p></div>
      <div className="discovery-layout">
        <aside className="sidebar glass-card">
          <h3 style={{marginTop: 0, marginBottom: '1.5rem'}}>Filters</h3>
          <div className="filter-group"><label>Search</label><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
          <div className="filter-group"><label>Category</label><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="filter-group"><label>Max Price: ₹{maxPrice}/day</label><input type="range" min="1" max="5000" value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))} className="range-slider" /></div>
          <div className="filter-group"><label>Sort By</label><select value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="newest">Newest First</option><option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option></select></div>
        </aside>
        <div className="main-grid">
          {filteredItems.map(item => (
            <div key={item._id} onClick={() => navigate(`/item/${item._id}`)} className="card">
              <div className="card-media"><img src={item.imageUrls[0]} alt="p" /><div className="card-price">₹{item.pricePerDay}<span>/day</span></div></div>
              <div className="card-info">
                <h3>{item.title}</h3><p>{item.description}</p>
                <div className="availability-tag"><span className={item.availableQuantity > 0 ? 'available' : 'booked'}>{item.availableQuantity > 0 ? `${item.availableQuantity} available` : 'Rented Out'}</span></div>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && <p className="muted" style={{gridColumn: '1/-1'}}>No items match your filters.</p>}
        </div>
      </div>
    </div>
  );
};

const ProductDetail = ({ token }) => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dates, setDates] = useState({ start: null, end: null });
  const [bookedDates, setBookedDates] = useState([]);
  const navigate = useNavigate();

  // 1. Safe Token Decoder
  let currentUserId = null;
  try {
    if (token) {
      currentUserId = JSON.parse(atob(token.split('.')[1])).userId;
    }
  } catch (error) {
    console.error("Corrupted token detected, clearing it out.");
    localStorage.removeItem('token');
  }

  const SECURITY_DEPOSIT = 500;

  // 2. Fetch Item and Booked Dates safely
  useEffect(() => { 
    fetch(`https://easy-renting-api.onrender.com/api/items/${id}`)
      .then(res => res.json())
      .then(setItem)
      .catch(err => console.error("Error loading item:", err));
      
    fetch(`https://easy-renting-api.onrender.com/api/bookings/item/${id}/dates`)
      .then(res => {
        if (!res.ok) throw new Error("Backend route not found");
        return res.json();
      })
      .then(data => {
         if (data.success && Array.isArray(data.bookings)) {
           let blocked = [];
           data.bookings.forEach(booking => {
             try {
               const daysInBooking = eachDayOfInterval({
                 start: new Date(booking.startDate),
                 end: new Date(booking.endDate)
               });
               blocked = [...blocked, ...daysInBooking];
             } catch (e) {
               console.error("Skipping a corrupted date:", e);
             }
           });
           setBookedDates(blocked);
         }
      })
      .catch(err => console.warn("Could not load calendar dates.", err));
  }, [id]);

  // ==========================================
  // CRITICAL FIX: The Loading Guard
  // This stops React from reading 'imageUrls' before the item arrives!
  // ==========================================
  if (!item) return <div className="loader" style={{textAlign: 'center', marginTop: '50px', color: 'white'}}>Loading item details...</div>;

  const isOwner = currentUserId === item.user?._id || currentUserId === item.user;

  // Calculate using Date objects for the new Calendar
  const calcRentalFee = () => {
    if (!dates.start || !dates.end) return 0;
    const days = Math.ceil((dates.end - dates.start) / 86400000) + 1;
    return days > 0 ? days * item.pricePerDay : 0;
  };

  const calcTotal = () => calcRentalFee() > 0 ? calcRentalFee() + SECURITY_DEPOSIT : 0;

  const handlePayment = async () => {
    if (!token) return navigate('/auth');
    if (calcTotal() === 0) return alert("Please select valid dates");
    setIsProcessing(true);

    const res = await loadRazorpayScript();
    if (!res) { alert("Failed to load payment gateway."); setIsProcessing(false); return; }

    const orderResponse = await fetch('https://easy-renting-api.onrender.com/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ amount: calcTotal() })
    });
    const orderData = await orderResponse.json();

    const options = {
      key: 'rzp_test_SeWuMDlMo3ENSg', 
      amount: orderData.amount,
      currency: orderData.currency,
      name: "EasyRenting",
      description: `${item.title} + Deposit`,
      order_id: orderData.id,
      handler: async function (response) {
        const verificationResponse = await fetch('https://easy-renting-api.onrender.com/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ 
            itemId: item._id, 
            sellerId: item.user?._id || item.user,
            totalPrice: calcTotal(), 
            startDate: dates.start, 
            endDate: dates.end,
            razorpayPaymentId: response.razorpay_payment_id, 
            razorpayOrderId: response.razorpay_order_id, 
            razorpaySignature: response.razorpay_signature
          })
        });

        if (verificationResponse.ok) {
          alert("Payment successful!"); navigate('/my-rentals');
        } else {
          alert("Payment verification failed."); setIsProcessing(false);
        }
      },
      theme: { color: "#6366f1" }
    };

    const paymentObject = new window.Razorpay(options);
    paymentObject.on('payment.failed', function (response){ alert("Payment failed."); setIsProcessing(false); });
    paymentObject.open();
  };

  return (
    <div className="detail-page">
      <div className="detail-grid">
        <ImageCarousel images={item.imageUrls} isDetail={true} />
        <div className="detail-text">
          <div className="badge">PRODUCT OVERVIEW</div>
          <h1>{item.title}</h1>
          <h2 className="price-tag">₹{item.pricePerDay}<span>/day</span></h2>
          <div className="divider"></div>
          <p className="desc">{item.description}</p>
          
          <div className="action-area">
            {!isOwner ? (
              <div className="btn-row"><button onClick={() => setShowBooking(true)} className="btn-primary">Check Availability</button></div>
            ) : (
              <div className="owner-section"><h3>Your Product</h3><p className="muted">This is how customers see your listing.</p></div>
            )}
          </div>
        </div>
      </div>

      {showBooking && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{width: '450px', color: 'white'}}>
            <h3>Select Rental Dates</h3>
            
            <div className="calendar-container" style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Pick-up Date</label>
                <DatePicker 
                  selected={dates.start} 
                  onChange={(date) => setDates({ ...dates, start: date, end: null })} 
                  selectsStart 
                  startDate={dates.start} 
                  endDate={dates.end} 
                  minDate={new Date()} 
                  excludeDates={bookedDates} 
                  placeholderText="Select start date"
                  className="custom-date-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '5px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Return Date</label>
                <DatePicker 
                  selected={dates.end} 
                  onChange={(date) => setDates({ ...dates, end: date })} 
                  selectsEnd 
                  startDate={dates.start} 
                  endDate={dates.end} 
                  minDate={dates.start || new Date()} 
                  excludeDates={bookedDates} 
                  placeholderText="Select end date"
                  className="custom-date-input"
                  disabled={!dates.start} 
                  style={{ width: '100%', padding: '10px', borderRadius: '5px' }}
                />
              </div>
            </div>

            {calcRentalFee() > 0 && (
              <div style={{background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', marginTop: '20px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}><span className="muted">Rental Fee:</span> <span>₹{calcRentalFee()}</span></div>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px solid #334155', paddingBottom: '15px'}}><span className="muted">Refundable Deposit:</span> <span>₹{SECURITY_DEPOSIT}</span></div>
                <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem', color: '#6366f1'}}><span>Total Due:</span> <span>₹{calcTotal()}</span></div>
              </div>
            )}
            
            <div className="modal-actions" style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
              <button onClick={handlePayment} className="btn-primary" disabled={calcTotal() === 0 || isProcessing} style={{flex: 1}}>{isProcessing ? 'Processing...' : 'Proceed to Payment'}</button>
              <button onClick={() => setShowBooking(false)} className="btn-outline" disabled={isProcessing}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MyListings = ({ token }) => {
  const [myItems, setMyItems] = useState([]);
  const [formData, setFormData] = useState({ title: '', description: '', pricePerDay: '', quantity: '1', category: 'Other' });
  const [selectedImages, setSelectedImages] = useState([]); 
  const [previews, setPreviews] = useState([]); 
  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const fetchMyItems = () => { fetch('https://easy-renting-api.onrender.com/api/items/my', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setMyItems); };
  useEffect(() => { if (token) fetchMyItems(); }, [token]);

  const handleSave = async (e) => {
    e.preventDefault(); 
    setIsUploading(true);
    
    try {
      const fd = new FormData();

      // 1. Safely add all text fields, ignoring any accidental image fields
      Object.keys(formData).forEach(key => {
        if (key !== 'image' && key !== 'images') {
          fd.append(key, formData[key]);
        }
      });

      // 2. Append the exact 'images' key for Multer array processing
      selectedImages.forEach((file) => {
        fd.append('images', file); 
      });

      const url = editingId ? `https://easy-renting-api.onrender.com/api/items/${editingId}` : 'https://easy-renting-api.onrender.com/api/items';
      
      const response = await fetch(url, { 
        method: editingId ? 'PUT' : 'POST', 
        headers: { 
          'Authorization': `Bearer ${token}` 
          // Notice there is NO 'Content-Type' here! The browser handles it for files.
        }, 
        body: fd 
      });

      if (response.ok) {
        setEditingId(null); 
        setFormData({title:'', description:'', pricePerDay:'', quantity:'1', category: 'Other'}); 
        setPreviews([]); 
        setSelectedImages([]); 
        fetchMyItems(); 
      } else {
        const errData = await response.json();
        alert(`Error: ${errData.message || "Failed to upload item"}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Something went wrong during upload. Check console.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this listing?")) {
      await fetch(`https://easy-renting-api.onrender.com/api/items/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchMyItems();
    }
  };

  return (
    <div className="manage-page">
      <div className="glass-card listing-form-box">
        <h2>{editingId ? 'Edit Listing' : 'List New Item'}</h2>
        <form onSubmit={handleSave} className="refined-listing-form">
          <input placeholder="Product Title" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
          <textarea placeholder="Description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
          <div className="input-grid-2">
            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} required>
              <option value="Clothing">Clothing</option><option value="Electronics">Electronics</option><option value="Tools">Tools</option><option value="Vehicles">Vehicles</option><option value="Other">Other</option>
            </select>
            <input type="number" placeholder="Price/Day" value={formData.pricePerDay} onChange={e => setFormData({...formData, pricePerDay: e.target.value})} required />
          </div>
          <div className="input-grid-2"><input type="number" placeholder="Quantity" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} required /></div>
          <input type="file" multiple onChange={e => { const files = Array.from(e.target.files); setSelectedImages([...selectedImages, ...files]); setPreviews([...previews, ...files.map(f => URL.createObjectURL(f))]); }} />
          <div className="preview-strip">{previews.map((u, i) => (<div key={i} className="thumb-box"><img src={u} alt="p" /><button type="button" onClick={() => setPreviews(previews.filter((_, idx) => idx !== i))}>×</button></div>))}</div>
          <div style={{display: 'flex', gap: '10px'}}>
            <button type="submit" disabled={isUploading} className="btn-primary" style={{flex: 1}}>{isUploading ? 'Uploading...' : (editingId ? 'Update Listing' : 'Publish Listing')}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setFormData({title:'', description:'', pricePerDay:'', quantity:'1', category: 'Other'}); setPreviews([]); setSelectedImages([]); }} className="btn-outline">Cancel</button>}
          </div>
        </form>
      </div>

      <div className="active-store">
        <h2>Your Storefront</h2>
        {myItems.map(item => (
          <div key={item._id} className="row-item">
            <div className="row-thumb"><img src={item.imageUrls[0]} alt="t" /></div>
            <div className="row-info"><h4>{item.title} <span style={{fontSize: '0.8rem', color: 'var(--primary)'}}>({item.category || 'Other'})</span></h4><p>₹{item.pricePerDay}/day • {item.quantity} stock</p></div>
            <div className="row-actions">
              <button onClick={() => { setEditingId(item._id); setFormData({title:item.title, description:item.description, pricePerDay:item.pricePerDay, quantity:item.quantity, category: item.category || 'Other'}); setPreviews(item.imageUrls); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="btn-edit">Edit</button>
              <button onClick={() => handleDelete(item._id)} className="btn-danger">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MyRentals = ({ token }) => {
  const [rentals, setRentals] = useState([]);
  useEffect(() => { if (token) fetch('https://easy-renting-api.onrender.com/api/bookings/my', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setRentals); }, [token]);
  return (
    <div className="container">
      <h2>Rental History</h2>
      {rentals.map(r => (
        <div key={r._id} className="row-item glass-card">
          <div className="row-thumb"><img src={r.item?.imageUrls[0]} alt="t" /></div>
          <div className="row-info"><h4>{r.item?.title}</h4><p>Amount Paid: <strong>₹{r.totalPrice}</strong> <span className="muted">(Includes Deposit)</span></p><small>Txn ID: {r.paymentId}</small></div>
        </div>
      ))}
    </div>
  );
};

const Auth = ({ setToken }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    const res = await fetch(`https://easy-renting-api.onrender.com/api/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (res.ok) { if (isLogin) { localStorage.setItem('token', data.token); setToken(data.token); navigate('/'); } else { alert("Account Created! Login now."); setIsLogin(true); } } else alert(data.message);
  };

  return (
    <div className="auth-view"><div className="glass-card auth-box"><h2>{isLogin ? 'Login' : 'Create Account'}</h2><form onSubmit={handleAuth} className="v-form"><input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required /><input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="submit" className="btn-primary">{isLogin ? 'Log In' : 'Join'}</button></form><p onClick={() => setIsLogin(!isLogin)} className="toggle-text">{isLogin ? "Need an account? Join" : "Already a member? Login"}</p></div></div>
  );
};

const OwnerDashboard = ({ token }) => {
  const [orders, setOrders] = useState([]);

  useEffect(() => { 
    if (token) {
      fetch('https://easy-renting-api.onrender.com/api/bookings/owner', { 
        headers: { 'Authorization': `Bearer ${token}` } 
      })
      .then(res => res.json())
      .then(setOrders);
    }
  }, [token]);

  return (
    <div className="container">
      <h2 style={{textAlign: 'left', marginBottom: '30px'}}>Customer Orders</h2>
      <div className="glass-card table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Customer</th>
              <th>Rental Dates</th>
              <th>Total Paid</th>
              <th>Status</th>
              <th>Transaction ID</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan="6" style={{textAlign: 'center', padding: '2rem'}}>No customers have rented your items yet.</td></tr>
            )}
            {orders.map(order => (
              <tr key={order._id}>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                    <img src={order.item?.imageUrls[0]} alt="thumb" style={{width: '45px', height: '45px', borderRadius: '8px', objectFit: 'cover'}} />
                    <strong>{order.item?.title}</strong>
                  </div>
                </td>
                <td>{order.buyer?.email}</td>
                <td>{new Date(order.startDate).toLocaleDateString()} <br/><span className="muted">to</span> {new Date(order.endDate).toLocaleDateString()}</td>
                <td style={{fontWeight: 'bold'}}>₹{order.totalPrice}</td>
                <td><span className="status-badge">{order.status}</span></td>
                <td><small className="muted">{order.paymentId}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  return (
    <Router>
      <nav className="nav">
        <div className="nav-inner">
          <Link to="/" className="nav-logo">EasyRenting.</Link>
          <div className="nav-links">
            <Link to="/">Explore</Link>
            {token ? (
              <>
                <Link to="/owner-dashboard">Dashboard</Link>
                <Link to="/my-listings">Manage Store</Link>
                <Link to="/my-rentals">My Rentals</Link>
                <button onClick={() => { localStorage.removeItem('token'); setToken(null); }} className="btn-logout">Logout</button>
              </>
            ) : <Link to="/auth" className="btn-login">Login</Link>}
          </div>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Marketplace />} />
          <Route path="/auth" element={<Auth setToken={setToken} />} />
          <Route path="/item/:id" element={<ProductDetail token={token} />} />
          <Route path="/my-listings" element={token ? <MyListings token={token} /> : <Auth setToken={setToken} />} />
          <Route path="/my-rentals" element={token ? <MyRentals token={token} /> : <Auth setToken={setToken} />} />
          <Route path="/owner-dashboard" element={token ? <OwnerDashboard token={token} /> : <Auth setToken={setToken} />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;