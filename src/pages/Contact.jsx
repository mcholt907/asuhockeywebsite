import React, { useState } from 'react';
import './Contact.css';

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Add your form submission logic here (e.g., emailJS, API call)
    alert('Thank you for your message! We\'ll respond within 48 hours.');
    setFormData({ name: '', email: '', message: '' });
  };

  return (
    <div className="contact-page">
      <h1>Contact Us</h1>
      
      <div className="contact-container">
        <div className="contact-info">
          <h2>Get in Touch</h2>
          <div className="info-item">
            <i className="fa fa-map-marker"></i>
            <div>
              <h4>Mailing Address</h4>
              <p>
                ASU Hockey Fan Site<br />
                123 Sun Devil Way<br />
                Tempe, AZ 85281
              </p>
            </div>
          </div>
          <div className="info-item">
            <i className="fa fa-envelope"></i>
            <div>
              <h4>Email</h4>
              <p>contact@asuhockeyfans.com</p>
            </div>
          </div>
          <div className="info-item">
            <i className="fa fa-phone"></i>
            <div>
              <h4>Phone</h4>
              <p>(480) 123-4567</p>
            </div>
          </div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="message">Message</label>
            <textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              rows="6"
              required
            ></textarea>
          </div>
          <button type="submit" className="submit-btn">
            Send Message
          </button>
        </form>
      </div>

      <div className="arena-map">
        <h2>Mullett Arena Location</h2>
        <iframe
          title="Mullett Arena Map"
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3329.238029968545!2d-111.9265846848009!3d33.4245809807803!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x872b08d9c2d0f8a5%3A0x4e4577674e4982a7!2sMullett%20Arena!5e0!3m2!1sen!2sus!4v1624567890123!5m2!1sen!2sus"
          width="100%"
          height="450"
          style={{border:0}}
          allowFullScreen=""
          loading="lazy"
        ></iframe>
      </div>
    </div>
  );
}

export default Contact;
