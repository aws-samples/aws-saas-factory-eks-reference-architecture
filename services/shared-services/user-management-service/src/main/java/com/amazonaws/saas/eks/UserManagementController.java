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
package com.amazonaws.saas.eks;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.amazonaws.saas.eks.dto.TenantDetails;
import com.amazonaws.saas.eks.dto.User;


@RestController
public class UserManagementController {

    @RequestMapping("/user/register")
    public TenantDetails userRegistration(@RequestBody TenantDetails tenant) {

    	UserManagementService userManagement = new UserManagementService();
		return userManagement.register(tenant);
    }
    
    @PostMapping(value="{companyName}/users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public User createUser(@PathVariable("companyName") String companyName, @RequestBody User user) {

    	UserManagementService userManagement = new UserManagementService();
   		return userManagement.createUser(companyName, user);
    }

    @PutMapping(value="{companyName}/users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public void updateUser(@PathVariable("companyName") String companyName, @PathVariable("status") String status, @RequestBody User user) {

    	UserManagementService userManagement = new UserManagementService();
    	userManagement.updateUser(user, companyName, status);
    }

    @GetMapping(value="{companyName}/users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public List<User> getUsers(@PathVariable("companyName") String companyName) {

    	UserManagementService userManagement = new UserManagementService();
   		return userManagement.getUsers(companyName);
    }
    
    @PostMapping(value="users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public User createSaaSProviderUser(@RequestParam("email") String email, @RequestParam("userPoolId") String userPoolId) {

    	UserManagementService userManagement = new UserManagementService();
   		return userManagement.createSaaSProviderUser(email, userPoolId);
    }

    @GetMapping(value="users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public List<User> getSaaSProviderUsers(@RequestParam("userPoolId") String userPoolId) {

    	UserManagementService userManagement = new UserManagementService();
   		return userManagement.getSaaSProviderUsers(userPoolId);
    }
   
}
