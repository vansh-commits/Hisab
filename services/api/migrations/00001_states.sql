-- +goose Up
CREATE TABLE states (
  code  char(2) PRIMARY KEY,
  name  text NOT NULL,
  is_ut_without_legislature boolean NOT NULL DEFAULT false  -- prints UTGST instead of SGST
);

INSERT INTO states (code, name, is_ut_without_legislature) VALUES
('01','Jammu and Kashmir',false), ('02','Himachal Pradesh',false), ('03','Punjab',false),
('04','Chandigarh',true), ('05','Uttarakhand',false), ('06','Haryana',false), ('07','Delhi',false),
('08','Rajasthan',false), ('09','Uttar Pradesh',false), ('10','Bihar',false), ('11','Sikkim',false),
('12','Arunachal Pradesh',false), ('13','Nagaland',false), ('14','Manipur',false), ('15','Mizoram',false),
('16','Tripura',false), ('17','Meghalaya',false), ('18','Assam',false), ('19','West Bengal',false),
('20','Jharkhand',false), ('21','Odisha',false), ('22','Chhattisgarh',false), ('23','Madhya Pradesh',false),
('24','Gujarat',false), ('26','Dadra and Nagar Haveli and Daman and Diu',true), ('27','Maharashtra',false),
('29','Karnataka',false), ('30','Goa',false), ('31','Lakshadweep',true), ('32','Kerala',false),
('33','Tamil Nadu',false), ('34','Puducherry',false), ('35','Andaman and Nicobar Islands',true),
('36','Telangana',false), ('37','Andhra Pradesh',false), ('38','Ladakh',true), ('97','Other Territory',false), ('99','Centre Jurisdiction',false);

-- +goose Down
DROP TABLE states;
