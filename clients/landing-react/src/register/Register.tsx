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
import { Button, Col, Container, Form, InputGroup, Jumbotron, Row } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Formik, FormikProps } from 'formik';
import * as yup from 'yup';

const schema = yup.object({
  fullName: yup.string().required(),
  email: yup.string().required(),
  password: yup
    .string()
    .required()
    .matches(
      /((?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W]).{8,64})/,
      'Must be at least 8 characters, One Uppercase, One Lowercase, One Number and one special case Character'
    ),
  confirmPassword: yup.string().oneOf([yup.ref('password'), undefined], 'Passwords must match'),
  planId: yup.string().required(),
  terms: yup.bool().required(),
});

function Register() {
  return (
    <Container className="mt-3">
      <Row>
        <Col md={{ span: 8, offset: 2 }}>
          <Jumbotron className="text-center">
          <h1 >Hello, new SaaS Tenant!</h1>
          <p>
            Once submitted, this form will create a new tenant at the subdomain indicated.
          </p>
          </Jumbotron>
        </Col>
      </Row>
      <Row>
        <Col md={{ span: 6, offset: 3 }}>
          <Formik
            validationSchema={schema}
            onSubmit={console.log}
            initialValues={{
              fullName: '',
              email: '',
              password: '',
              confirmPassword: '',
              companyName: '',
              planId: '',
              terms: false,
            }}
          >
            {(formik: FormikProps<any>) => (
              <Form noValidate>
                <Form.Group controlId="validationFormik01">
                  <InputGroup>
                    <InputGroup.Prepend>
                      <InputGroup.Text>
                        <FontAwesomeIcon icon="user" />
                      </InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                      type="text"
                      name="fullName"
                      placeholder="Full Name"
                      value={formik.values.fullName}
                      onChange={formik.handleChange}
                      isValid={formik.touched.fullName && !formik.errors.fullName}
                    />
                  </InputGroup>
                  <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
                </Form.Group>
                <Form.Group>
                  <InputGroup>
                    <InputGroup.Prepend>
                      <InputGroup.Text>
                        <FontAwesomeIcon icon="envelope" />
                      </InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                      type="text"
                      name="email"
                      placeholder="Email"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      isValid={formik.touched.email && !formik.errors.email}
                    />
                  </InputGroup>
                  <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
                </Form.Group>
                <Form.Group>
                  <InputGroup>
                    <InputGroup.Prepend>
                      <InputGroup.Text>
                        <FontAwesomeIcon icon="asterisk" />
                      </InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                      type="password"
                      placeholder="Password"
                      aria-describedby="inputGroupPrepend"
                      name="password"
                      value={formik.values.password}
                      onChange={formik.handleChange}
                      isInvalid={!!formik.errors.password}
                    />
                    <Form.Control.Feedback type="invalid">
                      {formik.errors.password}
                    </Form.Control.Feedback>
                  </InputGroup>
                </Form.Group>
                <Form.Group>
                  <InputGroup>
                    <InputGroup.Prepend>
                      <InputGroup.Text>
                        <FontAwesomeIcon icon="asterisk" />
                      </InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                      type="password"
                      placeholder="Confirm Password"
                      aria-describedby="inputGroupPrepend"
                      name="confirmPassword"
                      value={formik.values.confirmPassword}
                      onChange={formik.handleChange}
                      isInvalid={!!formik.errors.confirmPassword}
                    />
                    <Form.Control.Feedback type="invalid">
                      {formik.errors.confirmPassword}
                    </Form.Control.Feedback>
                  </InputGroup>
                </Form.Group>
                <Form.Group>
                  <InputGroup>
                    <InputGroup.Prepend>
                      <InputGroup.Text>
                        <FontAwesomeIcon icon="building" />
                      </InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                      type="text"
                      placeholder="Company Name"
                      aria-describedby="inputGroupPrepend"
                      name="companyName"
                      value={formik.values.companyName}
                      onChange={formik.handleChange}
                      isInvalid={!!formik.errors.companyName}
                    />
                    <Form.Control.Feedback type="invalid">
                      {formik.errors.companyName}
                    </Form.Control.Feedback>
                  </InputGroup>
                </Form.Group>
                <Form.Group>
                  <Form.Check
                    required
                    name="terms"
                    label="Agree to terms and conditions"
                    onChange={formik.handleChange}
                    isInvalid={!!formik.errors.terms}
                    feedback={formik.errors.terms}
                    id="validationFormik0"
                  />
                </Form.Group>
                <Button type="submit">Submit form</Button>
              </Form>
            )}
          </Formik>
        </Col>
      </Row>
    </Container>
  );
}

export default Register;
