/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import React from 'react';

import './LandingPage.scss';

function LandingPage() {
  return (
    <>
      <header className="bg-image d-flex align-items-center">
        <div className="container">
          <h1>EKS Reference Architecture</h1>
          <h2>It's so nice it blows your mind.</h2>
          <a href="" className="btn btn-transparent">
            Sign up now!
          </a>
        </div>
      </header>
      <section>
        <div className="container">
          <div className="row">
            <div className="col details align-self-center text-center">
              <h3 className="text-center">EKS Reference Architecture is so awesome.</h3>
              <p>
                Lorem ipsum dolor sit amet, consectetur adipisicing elit. Facere temporibus omnis
                illum, officia. Architecto voluptatibus commodi voluptatem perspiciatis eos
                possimus, eius at molestias quaerat magnam? Odio qui quos ipsam natus.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="section-primary">
        <div className="container">
          <div className="row">
            <div className="col-sm-4 features">
              <i className="fa fa-bolt"></i>
              <p>EKS Reference Architecture so awesome. Makes you awesome - go sign up!</p>
            </div>
            <div className="col-sm-4 features">
              <i className="fa fa-bank"></i>
              <p>
                EKS Reference Architecture so great. Makes you even greater - go sign up now. Super
                cheap deal!
              </p>
            </div>
            <div className="col-sm-4 features">
              <i className="fa fa-heart"></i>
              <p>Feel lonely? Go sign up and have a friend!</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-primary--alt">
        <div className="container">
          <h3>Take EKS Reference Architecture with you everywhere you go.</h3>
          <p>
            EKS Reference Architecture is all you need. Anywhere - ever. Lorem ipsum dolor sit amet,
            consectetur adipisicing elit. Expedita sapiente hic voluptatum quo sunt totam accusamus
            distinctio minus aliquid quis!
          </p>
        </div>
      </section>

      <section className="section-primary--light">
        <div className="container">
          <blockquote className="testimonial">
            <p>Love EKS Reference Architecture. So nice! So good! Could not live without!</p>
            <cite> Satisfied Customer </cite>
          </blockquote>
        </div>
      </section>

      <section className="section-primary--alt bg-image bg-image-2">
        <div className="container">
          <div className="row">
            <div className="col align-self-center">
              <h3>Reasons to sign up this product:</h3>
            </div>
          </div>
          <div className="row text--left justify-content-md-center">
            <div className="col-sm-3">
              <ul>
                <li>Its the best</li>
                <li>Its awesome</li>
                <li>It makes you happy</li>
                <li>It brings world peace</li>
                <li>Its free!</li>
              </ul>
            </div>
            <div className="col-sm-3">
              <ul>
                <li>Its the best</li>
                <li>Its awesome</li>
                <li>It makes you happy</li>
                <li>It brings world peace</li>
                <li>Its free!</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="text--center">
        <div className="container">
          <h3>Why you still reading?</h3>
          <a href="" className="btn">
            Sign up now!
          </a>
        </div>
      </section>
    </>
  );
}

export default LandingPage;
